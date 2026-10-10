import type { AssistantAnswer } from '@vlab/contracts';
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EngineError, type AssistantRequest, type EngineAdapter } from '../engine/adapter';
import { createApiEngineAdapter } from '../engine/apiAdapter';
import { resources } from '../i18n';
import { makeLocalAdapter, makeStore, renderApp, startSession } from './helpers';

const en = resources.en.translation;
const si = resources.si.translation;
const tx = (key: string) => en[key] ?? key;
const sx = (key: string) => si[key] ?? key;

const grounded = (over: Partial<AssistantAnswer> = {}): AssistantAnswer => ({
  status: 'grounded',
  answer: 'Weigh 26.5 g of Na₂CO₃ on the watch glass.',
  locale: 'en',
  evidenceSufficient: true,
  refusalReason: null,
  citations: [
    {
      chunkId: 'kc_0123456789abcdef0123',
      documentTitle: 'G.C.E. (A/L) Chemistry Practical Handbook',
      year: 2018,
      pdfPage: 30,
      printedPage: 22,
      section: 'Experiment 4: Preparation of standard solutions',
      heading: 'Procedure:',
    },
  ],
  aiAssistanceLabel: false,
  knowledgeVersion: 'kb-exp04-1.0.0',
  sequence: 0,
  stateFingerprint: '0123456789abcdef',
  cached: false,
  ...over,
});

/** Local engine with a scripted assistant, standing in for the API adapter. */
const withAssistant = (
  ask: (req: AssistantRequest) => Promise<AssistantAnswer>,
): { adapter: EngineAdapter; calls: AssistantRequest[] } => {
  const calls: AssistantRequest[] = [];
  const local = makeLocalAdapter();
  const adapter: EngineAdapter = {
    ...local,
    kind: 'api',
    askAssistant: (req) => {
      calls.push(req);
      return ask(req);
    },
  };
  return { adapter, calls };
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('assistant adapters', () => {
  it('API adapter posts only the session, question and locale', async () => {
    const fetchMock = vi.fn(async () => json(200, grounded()));
    const adapter = createApiEngineAdapter({
      baseUrl: 'http://api.example.test/',
      fetch: fetchMock,
    });
    const answer = await adapter.askAssistant({ sessionId: 's1', question: 'Why?', locale: 'si' });
    expect(answer.status).toBe('grounded');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.example.test/assistant/ask');
    expect(JSON.parse(String(init.body))).toEqual({
      sessionId: 's1',
      question: 'Why?',
      locale: 'si',
    });
  });

  it('API adapter rejects an answer that breaks the contract (e.g. leaked chunk text)', async () => {
    const leaky = { ...grounded(), chunkText: 'private passage' };
    const adapter = createApiEngineAdapter({
      baseUrl: 'http://x',
      fetch: async () => json(200, leaky),
    });
    await expect(
      adapter.askAssistant({ sessionId: 's', question: 'Why?', locale: 'en' }),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('the offline adapter reports the assistant as unavailable', async () => {
    await expect(
      makeLocalAdapter().askAssistant({ sessionId: 's', question: 'Why?', locale: 'en' }),
    ).rejects.toMatchObject({ code: 'assistant_unavailable' });
  });
});

describe('assistant panel', () => {
  it('is disabled offline with an explanation', async () => {
    const store = makeStore();
    await startSession(store, 'manual');
    renderApp(store);
    expect(screen.getByText(tx('assistant.offline'))).toBeInTheDocument();
    expect(screen.getByLabelText(tx('assistant.question.label'))).toBeDisabled();
  });

  it('shows a grounded answer with citations; manual mode sends no state and shows no assessment', async () => {
    const { adapter, calls } = withAssistant(async () => grounded());
    const store = makeStore(42, adapter);
    await startSession(store, 'manual');
    const { user } = renderApp(store);
    const field = screen.getByLabelText(tx('assistant.question.label'));
    expect(field).toHaveAccessibleDescription(tx('assistant.question.hint'));
    await user.type(field, '  How much Na₂CO₃ do I weigh?  ');
    await user.click(screen.getByRole('button', { name: tx('assistant.submit') }));
    const result = await screen.findByRole('article', { name: tx('assistant.status.grounded') });
    expect(
      within(result).getByText('Weigh 26.5 g of Na₂CO₃ on the watch glass.'),
    ).toBeInTheDocument();
    expect(within(result).getByText(/PDF p\. 30, printed p\. 22/)).toBeInTheDocument();
    expect(within(result).queryByText(tx('assistant.aiLabel'))).toBeNull();
    const session = store.getState().session;
    expect(calls).toEqual([
      { sessionId: session?.sessionId, question: 'How much Na₂CO₃ do I weigh?', locale: 'en' },
    ]);
    // Nothing about scores, errors or the learner's measurements is rendered by the panel.
    const panel = screen.getByRole('region', { name: tx('assistant.title') });
    expect(panel.textContent).not.toMatch(/score|INCOMPLETE|MASS_OUT/i);
  });

  it('labels Sinhala answers as AI assistance', async () => {
    const { adapter } = withAssistant(async () =>
      grounded({ locale: 'si', aiAssistanceLabel: true, answer: 'Na₂CO₃ 26.5 g කිරා ගන්න.' }),
    );
    const store = makeStore(42, adapter);
    await startSession(store, 'manual');
    store.getState().setLocale('si');
    const { user } = renderApp(store);
    await user.type(screen.getByLabelText(sx('assistant.question.label')), 'Na₂CO₃ කොපමණද?');
    await user.click(screen.getByRole('button', { name: sx('assistant.submit') }));
    expect(await screen.findByText(sx('assistant.aiLabel'))).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveAttribute('lang', 'si');
  });

  it('shows a refusal without citations', async () => {
    const { adapter } = withAssistant(async () =>
      grounded({
        status: 'refused',
        answer: en['assistant.refusal.insufficient_evidence'] ?? '',
        evidenceSufficient: false,
        refusalReason: 'insufficient_evidence',
        citations: [],
      }),
    );
    const store = makeStore(42, adapter);
    await startSession(store, 'manual');
    const { user } = renderApp(store);
    await user.type(screen.getByLabelText(tx('assistant.question.label')), 'Who won the cricket?');
    await user.click(screen.getByRole('button', { name: tx('assistant.submit') }));
    const result = await screen.findByRole('article', { name: tx('assistant.status.refused') });
    expect(within(result).queryByRole('list')).toBeNull();
  });

  it('reports an unavailable assistant as an alert and never invents an answer', async () => {
    const { adapter } = withAssistant(async () => {
      throw new EngineError('assistant_unavailable', 503, false);
    });
    const store = makeStore(42, adapter);
    await startSession(store, 'manual');
    const { user } = renderApp(store);
    await user.type(screen.getByLabelText(tx('assistant.question.label')), 'Why use a funnel?');
    await user.click(screen.getByRole('button', { name: tx('assistant.submit') }));
    const alert = await screen.findByText(tx('assistant.error.unavailable'));
    expect(alert).toHaveAttribute('role', 'alert');
    expect(screen.queryByRole('article')).toBeNull();
  });
});
