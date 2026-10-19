import {
  AdminAuditSchema,
  AdminDocumentsSchema,
  AdminDraftDetailSchema,
  AdminKnowledgeBuildSchema,
  AdminKnowledgeSchema,
  AdminLibrarySchema,
  AdminSettingsSchema,
  AdminStatusSchema,
  AdminSuggestResultSchema,
  AdminUsersSchema,
  type AdminDraftDetail,
  type AdminDraftSummary,
  type AdminImportResult,
  type AdminReviewRequest,
  type AdminStatus,
} from '@vlab/contracts';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AdminClient } from '../admin/adminClient';
import { createAdminClient } from '../admin/adminClient';
import { App } from '../App';
import { EngineError } from '../engine/adapter';
import { resources } from '../i18n';
import { makeStore } from './helpers';

const en = resources.en.translation;
const tx = (key: string) => en[key] ?? key;
const ID = 'a'.repeat(32);
const IMPORT = 'b'.repeat(32);
const SHA = 'c'.repeat(64);
const NOW = '2026-10-11T10:00:00Z';

const status: AdminStatus = AdminStatusSchema.parse({
  mode: 'development',
  limits: { maxUploadBytes: 25 * 1024 * 1024, maxPages: 400 },
  counts: { drafts: 2, needsReview: 1, contentApproved: 0, validationFailures: 1, imports: 1 },
  operations: ['import_guide', 'import_single', 'edit', 'validate', 'review'],
});

const detail = (
  over: Partial<AdminDraftDetail['draft']> = {},
  canApprove = false,
): AdminDraftDetail =>
  AdminDraftDetailSchema.parse({
    draft: {
      id: ID,
      version: 3,
      createdAt: NOW,
      updatedAt: NOW,
      importId: IMPORT,
      status: 'needs_review',
      content: {
        experimentNumber: 9,
        title: 'A complete practical',
        syllabusUnit: 'Unit 06 – Example unit',
        aims: ['To test the admin workflow'],
        apparatus: ['Beaker'],
        chemicals: ['NaCl(s)'],
        procedure: ['Dissolve the solid in water.'],
        precautions: [],
        calculations: [],
        observations: [],
        preLabQuestions: [],
        postLabQuestions: [],
      },
      sourcePages: { aims: [2], apparatus: [2], chemicals: [2], procedure: [3] },
      fieldReview: { experimentNumber: true, title: false },
      fieldEdited: { title: false },
      extractionIssues: [{ code: 'heuristic_split', field: 'apparatus', message: 'x' }],
      provenance: {
        sourceSha256: SHA,
        documentName: 'guide.pdf',
        importKind: 'guide',
        extractorVersion: 'admin-extract-1.0.0',
        pageRange: [2, 3],
      },
      translation: { si: 'not_started' },
      ...over,
    },
    validation: {
      contentComplete: false,
      missingFields: ['precautions'],
      provenanceOk: true,
      provenanceIssues: [],
      duplicates: [
        {
          kind: 'draft',
          experimentNumber: 9,
          otherId: 'd'.repeat(32),
          otherTitle: 'A conflicting title',
          conflictingTitle: true,
          similarity: null,
          blocking: true,
        },
      ],
      sinhalaReview: 'not_started',
      reviewComplete: false,
      unreviewedFields: ['title', 'aims'],
      simulation: {
        status: 'simulation_pending',
        reason: 'no_validated_definition',
        supportedKinds: ['standard_solution_by_mass'],
      },
      runnable: false,
      canApproveContent: canApprove,
      blocking: ['missing:precautions'],
      warnings: ['simulation_definition_missing'],
    },
  });

const summary = (
  d: AdminDraftDetail,
  over: Partial<AdminDraftSummary> = {},
): AdminDraftSummary => ({
  id: d.draft.id,
  version: d.draft.version,
  status: d.draft.status,
  experimentNumber: d.draft.content.experimentNumber,
  title: d.draft.content.title,
  syllabusUnit: d.draft.content.syllabusUnit,
  documentName: 'guide.pdf',
  importId: IMPORT,
  updatedAt: NOW,
  validation: {
    contentComplete: false,
    blockingCount: 1,
    warningCount: 1,
    canApproveContent: false,
    simulation: 'simulation_pending',
  },
  ...over,
});

const fakeClient = (
  over: Partial<AdminClient> = {},
): AdminClient & { reviews: AdminReviewRequest[] } => {
  const reviews: AdminReviewRequest[] = [];
  const base = detail();
  return {
    reviews,
    status: vi.fn(async () => status),
    drafts: vi.fn(async () => [
      summary(base),
      summary(base, {
        id: 'e'.repeat(32),
        experimentNumber: 4,
        title: 'Preparation of standard solutions',
        status: 'draft',
      }),
    ]),
    draft: vi.fn(async () => base),
    upload: vi.fn(async () => {
      throw new EngineError('document_encrypted', 422, false);
    }),
    update: vi.fn(async () => detail({ version: 4, fieldEdited: { title: true } })),
    validate: vi.fn(async () => base),
    review: vi.fn(async (_id: string, req: AdminReviewRequest) => {
      reviews.push(req);
      return detail({ version: base.draft.version + 1 });
    }),
    suggest: vi.fn(async () =>
      AdminSuggestResultSchema.parse({ accepted: 1, rejected: 2, detail: base }),
    ),
    library: vi.fn(async () => library),
    knowledge: vi.fn(async () => knowledge),
    buildKnowledge: vi.fn(async () => build),
    activateKnowledge: vi.fn(async () => ({
      ...knowledge,
      active: { knowledgeVersion: build.knowledgeVersion, chunkCount: 6, embeddingModel: 'm' },
    })),
    knowledgeChunks: vi.fn(async () => []),
    users: vi.fn(async () => users),
    createUser: vi.fn(async () => users.users[0]!),
    updateUser: vi.fn(async () => users.users[0]!),
    documents: vi.fn(async () => documents),
    updateDocument: vi.fn(async () => {
      throw new EngineError('draft_version_conflict', 409, false);
    }),
    translations: vi.fn(async () => [
      {
        file: 'ui',
        keys: 400,
        translated: 400,
        status: 'draft' as const,
        reviewer: null,
        reviewedOn: null,
      },
    ]),
    translationSheetUrl: (file: string) =>
      `http://127.0.0.1:8011/admin/dev/translations/${file}.csv`,
    audit: vi.fn(async () => audit),
    settings: vi.fn(async () => settings),
    ...over,
  };
};

const library = AdminLibrarySchema.parse({
  entries: [
    {
      kind: 'published',
      id: 'exp04_standard_solution',
      experimentNumber: 4,
      title: 'Experiment 4: Preparation of standard solutions',
      status: 'published',
      runnable: true,
      knowledgeChunks: 13,
      sinhala: 'draft',
      blockers: [],
    },
    {
      kind: 'draft',
      id: ID,
      experimentNumber: 9,
      title: 'A complete practical',
      status: 'content_approved',
      runnable: false,
      knowledgeChunks: 0,
      sinhala: 'not_started',
      blockers: ['simulation_definition_missing'],
    },
  ],
  rule: 'Only practicals with a validated simulation are runnable for students.',
});

const build = AdminKnowledgeBuildSchema.parse({
  id: 'f'.repeat(32),
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
  status: 'staged',
  knowledgeVersion: 'kb-admin-20261013000000-abcd1234',
  baseVersion: null,
  draftIds: [ID],
  chunkCount: 6,
  carriedChunks: 0,
  newChunks: 6,
  skippedExact: 0,
  skippedNear: 1,
  embeddingModel: 'fake/hashed-bow',
  modelRevision: 'fake-1',
  checks: [{ draftId: ID, query: 'A complete practical', hit: true }],
  checkPassed: true,
});

const knowledge = AdminKnowledgeSchema.parse({
  available: true,
  reason: null,
  repository: 'memory',
  embeddingProvider: 'fake',
  embeddingModel: 'intfloat/multilingual-e5-small',
  baseVersion: null,
  active: null,
  builds: [build],
});

const users = AdminUsersSchema.parse({
  users: [
    {
      id: 'f'.repeat(32),
      version: 2,
      createdAt: NOW,
      updatedAt: NOW,
      displayName: 'Learner 07',
      role: 'student',
      status: 'active',
      note: '',
    },
  ],
  learnerData: [{ ownerId: 'dev-learner', sessions: 3, submitted: 1, lastStartedOn: '2026-10-12' }],
  rolesEnforced: false,
});

const documents = AdminDocumentsSchema.parse([
  {
    importId: IMPORT,
    version: 1,
    documentName: 'guide.pdf',
    sourceSha256: SHA,
    kind: 'guide',
    pageCount: 12,
    sizeBytes: 2048,
    importedAt: NOW,
    drafts: 2,
    fileOk: true,
    licenceNote: '',
  },
]);

const audit = AdminAuditSchema.parse({
  events: [
    {
      seq: 1,
      at: NOW,
      actor: 'local-admin',
      action: 'import.created',
      targetKind: 'imports',
      targetId: IMPORT,
      details: { drafts: 2 },
      prev: '0'.repeat(64),
      hash: 'a'.repeat(64),
    },
  ],
  chainOk: true,
});

const settings = AdminSettingsSchema.parse({
  environment: 'development',
  adminRepository: 'file',
  knowledgeRepository: 'memory',
  databaseConfigured: false,
  embedding: { provider: 'fake', model: 'intfloat/multilingual-e5-small' },
  generation: {
    provider: 'disabled',
    openaiModel: null,
    groqModel: null,
    ollamaModel: null,
    openaiKeyConfigured: false,
    groqKeyConfigured: true,
  },
  ollamaBaseUrl: 'http://127.0.0.1:11434/v1',
  extractionAssist: 'disabled',
  loginEnabled: false,
});

const renderAdmin = async (client: AdminClient | null) => {
  const store = makeStore();
  const user = userEvent.setup();
  render(<App store={store} adminClient={client} />);
  return { store, user };
};

const openAdmin = async (client: AdminClient) => {
  const ctx = await renderAdmin(client);
  await ctx.user.click(await screen.findByRole('button', { name: tx('admin.nav') }));
  expect(
    await screen.findByRole('heading', { level: 1, name: tx('admin.title') }),
  ).toBeInTheDocument();
  return ctx;
};

describe('admin availability', () => {
  it('development builds list Admin; without a client the page explains how to enable it', async () => {
    const ctx = await renderAdmin(null);
    await ctx.user.click(screen.getByRole('button', { name: tx('admin.nav') }));
    expect(
      await screen.findByText(tx('admin.unavailable_title'), {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: tx('admin.sections') })).toBeNull();
  });

  it('a server that answers 404 (not local / disabled) gives no admin tools', async () => {
    const client = fakeClient({
      status: vi.fn(async () => {
        throw new EngineError('not_found', 404, false);
      }),
    });
    const ctx = await renderAdmin(client);
    await waitFor(() => expect(client.status).toHaveBeenCalled());
    await ctx.user.click(screen.getByRole('button', { name: tx('admin.nav') }));
    expect(
      await screen.findByText(tx('admin.unavailable_title'), {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: tx('admin.sections') })).toBeNull();
  });

  it('opens the lazily loaded admin view with real counts and a development warning', async () => {
    await openAdmin(fakeClient());
    expect(screen.getByText(tx('admin.dev_warning'))).toBeInTheDocument();
    const counts = await screen.findByRole('list', { name: tx('admin.counts') });
    expect(
      within(counts).getByText(tx('admin.count.validation_failures')).nextSibling,
    ).toHaveTextContent('1');
    expect(screen.getByText(tx('admin.op.not_available'))).toBeInTheDocument();
  });
});

describe('draft list', () => {
  it('searches, filters by status and opens a draft for review', async () => {
    const client = fakeClient();
    const { user } = await openAdmin(client);
    await user.click(screen.getByRole('button', { name: tx('admin.section.drafts') }));
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    await user.type(screen.getByLabelText(tx('admin.drafts.search')), 'standard');
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    await user.clear(screen.getByLabelText(tx('admin.drafts.search')));
    await user.selectOptions(
      screen.getByLabelText(tx('admin.drafts.status_filter')),
      'needs_review',
    );
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2);
    expect(screen.getAllByText(tx('admin.simulation.pending')).length).toBeGreaterThan(0);
    await user.click(
      screen.getByRole('button', {
        name: tx('admin.drafts.open_label').replace('{{title}}', 'A complete practical'),
      }),
    );
    expect(
      await screen.findByRole('heading', { name: /A complete practical/ }),
    ).toBeInTheDocument();
    expect(client.draft).toHaveBeenCalledWith(ID);
  });
});

describe('draft review', () => {
  const openReview = async (client = fakeClient()) => {
    const ctx = await openAdmin(client);
    await ctx.user.click(screen.getByRole('button', { name: tx('admin.section.drafts') }));
    await ctx.user.click(
      screen.getByRole('button', {
        name: tx('admin.drafts.open_label').replace('{{title}}', 'A complete practical'),
      }),
    );
    await screen.findByRole('heading', { name: /A complete practical/ });
    return { ...ctx, client };
  };

  it('shows validation separately from simulation readiness, and blocks approval', async () => {
    await openReview();
    expect(screen.getByText(tx('admin.simulation.not_runnable'))).toBeInTheDocument();
    expect(screen.getByText(tx('admin.simulation.separate'))).toBeInTheDocument();
    expect(screen.getByText(/A conflicting title/)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(tx('admin.duplicate.blocking').slice(0, 20))),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: tx('admin.action.approve_content') })).toBeDisabled();
    expect(screen.getAllByText(tx('admin.issue.heuristic_split')).length).toBe(1);
    expect(screen.getByText(tx('admin.sinhala.not_started'))).toBeInTheDocument();
  });

  it('marks a field reviewed with the current version', async () => {
    const { user, client } = await openReview();
    await user.click(document.getElementById('field-title-reviewed')!);
    await waitFor(() => expect(client.reviews).toHaveLength(1));
    expect(client.reviews[0]).toEqual({
      expectedVersion: 3,
      action: 'mark_field',
      field: 'title',
      reviewed: true,
    });
  });

  it('editing makes the form dirty, disables review controls, and saves parsed content', async () => {
    const { user, client } = await openReview();
    const precautions = screen.getByLabelText(tx('admin.field.precautions'));
    await user.type(precautions, 'Wear goggles.{enter}Avoid touching the chemicals.');
    expect(screen.getByText(tx('admin.review.unsaved'))).toBeInTheDocument();
    expect(document.getElementById('field-title-reviewed')).toBeDisabled();
    await user.type(document.getElementById('field-precautions-pages')!, '2, 3');
    await user.click(screen.getByRole('button', { name: tx('admin.review.save') }));
    await waitFor(() => expect(client.update).toHaveBeenCalled());
    const [, req] = (client.update as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(req.expectedVersion).toBe(3);
    expect(req.content.precautions).toEqual(['Wear goggles.', 'Avoid touching the chemicals.']);
    expect(req.sourcePages.precautions).toEqual([2, 3]);
    expect(await screen.findByText(tx('admin.review.saved'))).toBeInTheDocument();
  });

  it('reports a version conflict without losing the page', async () => {
    const client = fakeClient({
      update: vi.fn(async () => {
        throw new EngineError('draft_version_conflict', 409, false, { currentVersion: 5 });
      }),
    });
    const { user } = await openReview(client);
    await user.type(screen.getByLabelText(tx('admin.field.precautions')), 'x');
    await user.click(screen.getByRole('button', { name: tx('admin.review.save') }));
    expect(await screen.findByText(tx('admin.error.draft_version_conflict'))).toBeInTheDocument();
  });

  it('rejects non-numeric source pages locally', async () => {
    const { user, client } = await openReview();
    await user.type(document.getElementById('field-aims-pages')!, 'two');
    await user.click(screen.getByRole('button', { name: tx('admin.review.save') }));
    expect(await screen.findByText(tx('admin.error.invalid_field'))).toBeInTheDocument();
    expect(client.update).not.toHaveBeenCalled();
  });
});

describe('document import', () => {
  const openImport = async (client = fakeClient()) => {
    const ctx = await openAdmin(client);
    await ctx.user.click(screen.getByRole('button', { name: tx('admin.section.import') }));
    return { ...ctx, client };
  };
  const input = () => document.querySelector<HTMLInputElement>('input[type=file]')!;

  it('states the requirements and the draft-only rule', async () => {
    await openImport();
    expect(screen.getByText(tx('admin.import.draft_only'))).toBeInTheDocument();
    expect(
      screen.getByText(tx('admin.import.req_size').replace('{{mb}}', '25')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(tx('admin.import.req_pages').replace('{{pages}}', '400')),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: tx('admin.import.start') })).toBeDisabled();
  });

  it('rejects a non-PDF file before uploading', async () => {
    const { client } = await openImport();
    // The file chooser filters by `accept`; drag-and-drop does not, so the panel checks too.
    fireEvent.change(input(), {
      target: { files: [new File(['MZ'], 'tool.exe', { type: 'application/octet-stream' })] },
    });
    expect(screen.getByText(tx('admin.error.not_pdf'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: tx('admin.import.start') })).toBeDisabled();
    expect(client.upload).not.toHaveBeenCalled();
  });

  it('shows the server rejection reason', async () => {
    const { user } = await openImport();
    await user.upload(input(), new File(['%PDF-1.4'], 'locked.pdf', { type: 'application/pdf' }));
    await user.click(screen.getByRole('button', { name: tx('admin.import.start') }));
    expect(await screen.findByText(tx('admin.error.document_encrypted'))).toBeInTheDocument();
  });

  it('uploads with progress and lists the created drafts', async () => {
    let release: (value: AdminImportResult) => void = () => undefined;
    const client = fakeClient({
      upload: vi.fn(
        (_kind, _file, onProgress) =>
          new Promise<AdminImportResult>((resolve) => {
            onProgress(0.5);
            release = resolve;
          }),
      ),
    });
    const { user } = await openImport(client);
    await user.click(screen.getByLabelText(tx('admin.import.single.title')));
    await user.upload(input(), new File(['%PDF-1.4'], 'single.pdf', { type: 'application/pdf' }));
    await user.click(screen.getByRole('button', { name: tx('admin.import.start') }));
    expect(
      await screen.findByText(tx('admin.import.uploading').replace('{{percent}}', '50')),
    ).toBeInTheDocument();
    expect(client.upload).toHaveBeenCalledWith('single', expect.any(File), expect.any(Function));
    release({
      import: {
        id: IMPORT,
        version: 1,
        createdAt: NOW,
        updatedAt: NOW,
        kind: 'single',
        documentName: 'single.pdf',
        sourceSha256: SHA,
        sizeBytes: 8,
        pageCount: 2,
        extractorVersion: 'admin-extract-1.0.0',
        draftIds: [ID],
      },
      drafts: [summary(detail())],
    });
    expect(await screen.findByRole('button', { name: /A complete practical/ })).toBeInTheDocument();
  });
});

describe('admin client', () => {
  const json = (s: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status: s,
      headers: { 'Content-Type': 'application/json' },
    });

  it('uses the /admin/dev paths and validates responses', async () => {
    const fetchMock = vi.fn(async () => json(200, status));
    const client = createAdminClient({ baseUrl: 'http://127.0.0.1:8000/', fetch: fetchMock });
    expect(await client.status()).toEqual(status);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      'http://127.0.0.1:8000/admin/dev/status',
    );
    const garbage = createAdminClient({
      baseUrl: 'http://x',
      fetch: async () => json(200, { mode: 'production' }),
    });
    await expect(garbage.status()).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('maps the server 404 to not_found and sends review requests as JSON', async () => {
    const notFound = createAdminClient({
      baseUrl: 'http://x',
      fetch: async () =>
        json(404, {
          error: { code: 'not_found', message: 'Not found', correlationId: 'c', retryable: false },
        }),
    });
    await expect(notFound.status()).rejects.toMatchObject({ code: 'not_found', status: 404 });
    const fetchMock = vi.fn(async () => json(200, detail()));
    const client = createAdminClient({ baseUrl: 'http://x', fetch: fetchMock });
    await client.review(ID, {
      expectedVersion: 3,
      action: 'submit_for_review',
      field: null,
      reviewed: null,
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`http://x/admin/dev/drafts/${ID}/review`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body)).action).toBe('submit_for_review');
  });

  it('uploads through the injected uploader with kind and filename', async () => {
    const uploader = vi.fn(async (_url: string, _file: Blob, onProgress: (f: number) => void) => {
      onProgress(1);
      return {
        status: 422,
        body: {
          error: {
            code: 'document_too_many_pages',
            message: 'x',
            correlationId: 'c',
            retryable: false,
          },
        },
      };
    });
    const client = createAdminClient({ baseUrl: 'http://x', uploader });
    const progress = vi.fn();
    await expect(
      client.upload('guide', new File(['%PDF'], 'My Guide.pdf'), progress),
    ).rejects.toMatchObject({ code: 'document_too_many_pages' });
    expect(uploader.mock.calls[0]![0]).toBe(
      'http://x/admin/dev/imports?kind=guide&filename=My%20Guide.pdf',
    );
    expect(progress).toHaveBeenCalledWith(1);
  });
});

const adminNavButton = (section: string) =>
  within(screen.getByRole('navigation', { name: tx('admin.sections') })).getByRole('button', {
    name: tx(`admin.section.${section}`),
  });

describe('admin console sections', () => {
  const go = async (client: AdminClient, section: string) => {
    const ctx = await openAdmin(client);
    await ctx.user.click(adminNavButton(section));
    return ctx;
  };

  it('library shows published and draft practicals with runnable status and opens a review', async () => {
    const client = fakeClient();
    const { user } = await go(client, 'library');
    const table = await screen.findByRole('table', { name: tx('admin.library.title') });
    expect(within(table).getByText(tx('admin.library.runnable'))).toBeInTheDocument();
    expect(within(table).getByText(tx('admin.library.not_runnable'))).toBeInTheDocument();
    await user.click(within(table).getByRole('button', { name: tx('admin.library.open') }));
    expect(
      await screen.findByRole('heading', { name: /A complete practical/ }),
    ).toBeInTheDocument();
  });

  it('knowledge base builds from approved drafts and activates a version', async () => {
    const approved = {
      ...fakeClient(),
      drafts: vi.fn(async () => [
        summary(detail(), {
          status: 'content_approved' as const,
          validation: {
            contentComplete: true,
            blockingCount: 0,
            warningCount: 1,
            canApproveContent: false,
            simulation: 'simulation_pending' as const,
          },
        }),
      ]),
    } as ReturnType<typeof fakeClient>;
    const { user } = await go(approved, 'knowledge');
    await user.click(await screen.findByLabelText(/A complete practical/));
    await user.click(screen.getByRole('button', { name: tx('admin.kb.build') }));
    await waitFor(() => expect(approved.buildKnowledge).toHaveBeenCalledWith([ID]));
    await user.click(await screen.findByRole('button', { name: tx('admin.kb.activate') }));
    await waitFor(() =>
      expect(approved.activateKnowledge).toHaveBeenCalledWith(build.knowledgeVersion),
    );
  });

  it('knowledge base explains when no embedding provider is configured', async () => {
    const client = fakeClient({
      knowledge: vi.fn(async () => ({
        ...knowledge,
        available: false,
        reason: 'embedding_provider_disabled' as const,
        embeddingProvider: 'disabled' as const,
      })),
    });
    await go(client, 'knowledge');
    expect(await screen.findByText(tx('admin.kb.unavailable_title'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: tx('admin.kb.build') })).toBeNull();
  });

  it('users: no-login notice, create and role change with the current version', async () => {
    const client = fakeClient();
    const { user } = await go(client, 'users');
    expect(await screen.findByText(tx('admin.users.no_login'))).toBeInTheDocument();
    await user.type(screen.getByLabelText(tx('admin.users.name')), 'Learner 08');
    await user.click(screen.getByRole('button', { name: tx('admin.users.create') }));
    await waitFor(() =>
      expect(client.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Learner 08',
          role: 'student',
          expectedVersion: null,
        }),
      ),
    );
    const row = screen.getByRole('row', { name: /Learner 07/ });
    await user.selectOptions(
      within(row).getByRole('combobox', { name: tx('admin.users.role') }),
      'teacher',
    );
    await waitFor(() =>
      expect(client.updateUser).toHaveBeenCalledWith(
        'f'.repeat(32),
        expect.objectContaining({ role: 'teacher', expectedVersion: 2 }),
      ),
    );
    expect(screen.getByText('dev-learner')).toBeInTheDocument();
  });

  it('documents register reports a version conflict on save', async () => {
    const client = fakeClient();
    const { user } = await go(client, 'import');
    const input = await screen.findByLabelText(tx('admin.docs.licence'));
    await user.type(input, 'NIE');
    await user.click(screen.getByRole('button', { name: tx('admin.docs.save') }));
    expect(await screen.findByText(tx('admin.error.draft_version_conflict'))).toBeInTheDocument();
  });

  it('translations, audit and settings are read-only views without secrets', async () => {
    const client = fakeClient();
    const { user } = await go(client, 'translations');
    const link = await screen.findByRole('link', { name: tx('admin.tr.download') });
    expect(link).toHaveAttribute('href', expect.stringContaining('/translations/ui.csv'));
    await user.click(adminNavButton('audit'));
    expect(await screen.findByText(tx('admin.audit.chain_ok'))).toBeInTheDocument();
    expect(screen.getByText('import.created')).toBeInTheDocument();
    await user.click(adminNavButton('settings'));
    expect(
      await screen.findByRole('heading', { name: tx('admin.settings.title') }),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/sk-|gsk_/);
  });
});

describe('review: duplicates and local AI suggestions', () => {
  const contentDuplicate = () =>
    AdminDraftDetailSchema.parse({
      ...detail(),
      draft: {
        ...detail().draft,
        suggestions: {
          precautions: [{ text: 'Wear safety goggles', page: 2, quote: 'Wear safety goggles.' }],
        },
      },
      validation: {
        ...detail().validation,
        duplicates: [
          {
            kind: 'content',
            experimentNumber: 11,
            otherId: 'd'.repeat(32),
            otherTitle: 'A renumbered copy',
            conflictingTitle: true,
            similarity: 0.82,
            blocking: true,
          },
        ],
      },
    });

  const openReview = async (client: AdminClient) => {
    const ctx = await openAdmin(client);
    await ctx.user.click(screen.getByRole('button', { name: tx('admin.section.drafts') }));
    await ctx.user.click(
      screen.getByRole('button', {
        name: tx('admin.drafts.open_label').replace('{{title}}', 'A complete practical'),
      }),
    );
    await screen.findByRole('heading', { name: /A complete practical/ });
    return ctx;
  };

  it('a blocking content duplicate can be marked as a different practical', async () => {
    const client = fakeClient({ draft: vi.fn(async () => contentDuplicate()) });
    const { user } = await openReview(client);
    expect(screen.getByText(/82/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: tx('admin.duplicate.mark_distinct') }));
    await waitFor(() =>
      expect(client.reviews.at(-1)).toMatchObject({
        action: 'mark_distinct',
        otherId: 'd'.repeat(32),
      }),
    );
  });

  it('verified suggestions are shown with their page and only added on request', async () => {
    const client = fakeClient({ draft: vi.fn(async () => contentDuplicate()) });
    const { user } = await openReview(client);
    expect(screen.getByText('Wear safety goggles')).toBeInTheDocument();
    const field = screen.getByLabelText(tx('admin.field.precautions')) as HTMLTextAreaElement;
    expect(field.value).toBe('');
    await user.click(screen.getByRole('button', { name: tx('admin.assist.add') }));
    expect(field.value).toBe('Wear safety goggles');
    expect(screen.getByText(tx('admin.review.unsaved'))).toBeInTheDocument();
    expect(client.update).not.toHaveBeenCalled();
  });

  it('asks the local assistant only for empty list fields', async () => {
    const client = fakeClient();
    const { user } = await openReview(client);
    await user.click(screen.getByRole('button', { name: tx('admin.assist.button') }));
    await waitFor(() => expect(client.suggest).toHaveBeenCalled());
    const [, req] = vi.mocked(client.suggest).mock.calls[0]!;
    expect(req.fields).toContain('precautions');
    expect(req.fields).not.toContain('aims');
  });
});

describe('quick fix and approve now', () => {
  const ready = (): AdminDraftDetail =>
    AdminDraftDetailSchema.parse({
      ...detail(),
      draft: {
        ...detail().draft,
        content: { ...detail().draft.content, precautions: ['Wear goggles'] },
      },
      validation: {
        ...detail().validation,
        contentComplete: true,
        missingFields: [],
        duplicates: [],
        blocking: [],
      },
    });

  const openReview = async (client: AdminClient) => {
    const ctx = await openAdmin(client);
    await ctx.user.click(screen.getByRole('button', { name: tx('admin.section.drafts') }));
    await ctx.user.click(
      screen.getByRole('button', {
        name: tx('admin.drafts.open_label').replace('{{title}}', 'A complete practical'),
      }),
    );
    await screen.findByRole('heading', { name: /A complete practical/ });
    return ctx;
  };

  it('bulk bar fixes drafts with issues and approves ready drafts after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const base = detail();
    const client = fakeClient({
      drafts: vi.fn(async () => [
        summary(base),
        summary(base, {
          id: 'e'.repeat(32),
          title: 'Ready practical',
          validation: { ...summary(base).validation, blockingCount: 0 },
        }),
      ]),
    });
    const { user } = await openAdmin(client);
    await user.click(screen.getByRole('button', { name: tx('admin.section.drafts') }));
    const bulk = screen.getByRole('group', { name: tx('admin.quick.bulk') });
    await user.click(within(bulk).getByRole('button', { name: /Fix all \(1\)/ }));
    await waitFor(() => expect(client.reviews).toHaveLength(1));
    expect(client.reviews[0]).toMatchObject({ action: 'quick_fix', expectedVersion: 3 });
    await user.click(within(bulk).getByRole('button', { name: /Approve all ready \(1\)/ }));
    await waitFor(() => expect(client.reviews).toHaveLength(2));
    expect(client.reviews[1]).toMatchObject({ action: 'quick_approve' });
    expect(confirm).toHaveBeenCalledTimes(2);
    // Only the ready draft gets a per-row Approve button.
    expect(
      screen.getByRole('button', {
        name: tx('admin.quick.approve_label').replace('{{title}}', 'Ready practical'),
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: tx('admin.quick.approve_label').replace('{{title}}', 'A complete practical'),
      }),
    ).toBeNull();
    confirm.mockRestore();
  });

  it('cancelling the confirmation sends nothing', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const client = fakeClient();
    const { user } = await openAdmin(client);
    await user.click(screen.getByRole('button', { name: tx('admin.section.drafts') }));
    await user.click(screen.getByRole('button', { name: /Fix all/ }));
    expect(client.review).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('review page: Approve now is blocked by blocking issues; Quick fix reports what it did', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fixed = detail({ version: 4, quickFixLog: ['absent:precautions'] });
    const client = fakeClient({
      review: vi.fn(async (_id: string, req: AdminReviewRequest) => {
        client.reviews.push(req);
        return fixed;
      }),
    });
    const { user } = await openReview(client);
    expect(screen.getByRole('button', { name: tx('admin.quick.approve') })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: tx('admin.quick.fix') }));
    await waitFor(() => expect(client.reviews.at(-1)).toMatchObject({ action: 'quick_fix' }));
    expect(
      await screen.findByText(/Precautions confirmed as not given in the source/i),
    ).toBeInTheDocument();
    confirm.mockRestore();
  });

  it('review page: a draft without blocking issues can be approved now', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const client = fakeClient({ draft: vi.fn(async () => ready()) });
    const { user } = await openReview(client);
    const approve = screen.getByRole('button', { name: tx('admin.quick.approve') });
    expect(approve).toBeEnabled();
    await user.click(approve);
    await waitFor(() =>
      expect(client.reviews.at(-1)).toMatchObject({ action: 'quick_approve', expectedVersion: 3 }),
    );
    confirm.mockRestore();
  });

  it('fields are collapsible; reviewed fields start closed, missing ones open', async () => {
    await openReview(fakeClient());
    const fieldOf = (key: string) =>
      screen
        .getByText(tx(`admin.field.${key}`), { selector: '.admin-field__name' })
        .closest('details')!;
    expect(fieldOf('experimentNumber').open).toBe(false);
    expect(fieldOf('precautions').open).toBe(true);
    expect(within(fieldOf('aims')).getByText(tx('admin.review.items_one'))).toBeInTheDocument();
  });
});
