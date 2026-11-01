/**
 * simulation-core verifier CLI (bundled to dist/verifier.mjs).
 *
 * Reads one JSON request from stdin and writes one JSON response to stdout. Protocol-level failures
 * (invalid request, version mismatch, tampered chain, ...) are `ok: false` responses with exit code
 * 0; only an internal crash exits non-zero, with diagnostics on stderr and nothing on stdout.
 */
import {
  AssessmentDefinitionSchema,
  ExperimentDefinitionSchema,
  VERIFIER_PROTOCOL,
  VerifierRequestSchema,
  type SimulationState,
  type VerifierResponse,
} from '@vlab/contracts';
import pkg from '../package.json';
import {
  applyEnvelope,
  createInitialState,
  fingerprint,
  previewEnvelope,
  projectSession,
  reportFor,
  verifyEventStream,
  type SimulationContext,
} from '../src';

export const ENGINE_VERSION: string = pkg.version;
const MAX_INPUT_BYTES = 4 * 1024 * 1024;

type ErrorCodeV = Extract<VerifierResponse, { ok: false }>['error']['code'];
const fail = (
  code: ErrorCodeV,
  message: string,
  divergedAtSeq: number | null = null,
): VerifierResponse => ({
  protocol: VERIFIER_PROTOCOL,
  ok: false,
  engineVersion: ENGINE_VERSION,
  error: { code, message, divergedAtSeq },
});

const head = (state: SimulationState) =>
  state.events.at(-1)?.fingerprintAfter ?? fingerprint(state);

export const handle = (raw: unknown): VerifierResponse => {
  const parsed = VerifierRequestSchema.safeParse(raw);
  if (!parsed.success)
    return fail('invalid_request', 'Request does not match the verifier protocol');
  const req = parsed.data;
  const definition = ExperimentDefinitionSchema.safeParse(req.definition);
  const assessment = AssessmentDefinitionSchema.safeParse(req.assessment);
  if (!definition.success || !assessment.success)
    return fail('invalid_request', 'Invalid experiment definition or assessment');
  const ctx: SimulationContext = { definition: definition.data, assessment: assessment.data };
  if (
    req.expected.engineVersion !== ENGINE_VERSION ||
    req.expected.definitionVersion !== ctx.definition.definitionVersion ||
    req.expected.assessmentVersion !== ctx.assessment.version ||
    ctx.assessment.experimentId !== ctx.definition.experimentId
  )
    return fail('version_mismatch', 'Engine, definition or assessment version mismatch');
  const ok = { protocol: VERIFIER_PROTOCOL, ok: true, engineVersion: ENGINE_VERSION } as const;

  if (req.op === 'initialize') {
    const state = createInitialState(req.init, ctx);
    return {
      ...ok,
      op: 'initialize',
      result: { view: projectSession(state, ctx), headFingerprint: head(state) },
    };
  }

  // Every other operation rebuilds the authoritative state from the stored event chain first.
  const verified = verifyEventStream(req.init, req.events, ctx);
  if (!verified.ok)
    return fail(
      'event_chain_invalid',
      `Event chain diverged (${verified.field})`,
      verified.divergedAtSeq,
    );
  const state = verified.state;

  switch (req.op) {
    case 'apply': {
      const result = applyEnvelope(state, req.envelope, ctx);
      if (!result.ok)
        return fail(result.code, 'System actions are limited to the automatic demonstration');
      return {
        ...ok,
        op: 'apply',
        result: {
          event: result.event,
          feedback: result.feedback,
          view: result.view,
          headFingerprint: result.event.fingerprintAfter,
        },
      };
    }
    case 'preview': {
      const result = previewEnvelope(state, req.envelope, ctx);
      if (!result.ok)
        return fail(result.code, 'Preview is not available for this guidance profile');
      return { ...ok, op: 'preview', result: { predictedErrors: result.predictedErrors } };
    }
    case 'view':
      return {
        ...ok,
        op: 'view',
        result: { view: projectSession(state, ctx), headFingerprint: head(state) },
      };
    case 'report': {
      const result = reportFor(state, ctx);
      if (!result.ok) return fail(result.code, 'The experiment has not been submitted');
      return {
        ...ok,
        op: 'report',
        result: { report: result.report, headFingerprint: head(state) },
      };
    }
    case 'verify':
      return {
        ...ok,
        op: 'verify',
        result: { headFingerprint: head(state), eventCount: state.events.length },
      };
  }
};

const readStdin = async (): Promise<string | null> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
};

const main = async () => {
  const text = await readStdin();
  let response: VerifierResponse;
  if (text === null) response = fail('invalid_request', 'Request exceeds the maximum size');
  else {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    response =
      json === undefined ? fail('invalid_request', 'Request is not valid JSON') : handle(json);
  }
  process.stdout.write(JSON.stringify(response));
};

const isEntry =
  process.argv[1] !== undefined &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop() ?? '');
if (isEntry)
  main().catch((err: unknown) => {
    process.stderr.write(
      `verifier internal error: ${err instanceof Error ? err.name : 'unknown'}\n`,
    );
    process.exit(2);
  });
