import {
  AdminAuditSchema,
  AdminDocumentsSchema,
  AdminDraftDetailSchema,
  AdminDraftSummarySchema,
  AdminImportResultSchema,
  AdminImportSchema,
  AdminKnowledgeBuildSchema,
  AdminKnowledgeChunksSchema,
  AdminKnowledgeSchema,
  AdminLibrarySchema,
  AdminSettingsSchema,
  AdminStatusSchema,
  AdminSuggestResultSchema,
  AdminTranslationsSchema,
  AdminUserSchema,
  AdminUsersSchema,
  ApiErrorSchema,
  TeachingRecordSchema,
  type TeachingRecord,
  type TeachingDefinition,
  type AdminAudit,
  type AdminDocuments,
  type AdminDocumentUpdateRequest,
  type AdminDraftDetail,
  type AdminDraftSummary,
  type AdminDraftUpdateRequest,
  type AdminImport,
  type AdminImportResult,
  type AdminKnowledge,
  type AdminKnowledgeBuild,
  type AdminKnowledgeChunks,
  type AdminLibrary,
  type AdminReviewRequest,
  type AdminSettings,
  type AdminStatus,
  type AdminSuggestRequest,
  type AdminSuggestResult,
  type AdminTranslations,
  type AdminUser,
  type AdminUserRequest,
  type AdminUsers,
} from '@vlab/contracts';
import { EngineError } from '../engine/adapter';

/**
 * Client for the development-only admin API. The server alone decides access (loopback-only,
 * 404 otherwise); this client never assumes it is authorised.
 */
export type UploadProgress = (fraction: number) => void;
export type Uploader = (
  url: string,
  file: Blob,
  onProgress: UploadProgress,
) => Promise<{ status: number; body: unknown }>;

export interface AdminClient {
  simulationModels?(): Promise<TeachingRecord[]>;
  saveSimulationModel?(
    id: string | null,
    expectedVersion: number | null,
    definition: TeachingDefinition,
  ): Promise<TeachingRecord>;
  activateLocalSimulation?(
    id: string,
    expectedVersion: number,
    reviewer: string,
  ): Promise<TeachingRecord>;
  deactivateLocalSimulation?(id: string, expectedVersion: number): Promise<TeachingRecord>;
  status(): Promise<AdminStatus>;
  drafts(): Promise<AdminDraftSummary[]>;
  draft(id: string): Promise<AdminDraftDetail>;
  upload(
    kind: 'guide' | 'single',
    file: File,
    onProgress: UploadProgress,
  ): Promise<AdminImportResult>;
  update(id: string, req: AdminDraftUpdateRequest): Promise<AdminDraftDetail>;
  validate(id: string): Promise<AdminDraftDetail>;
  review(id: string, req: AdminReviewRequest): Promise<AdminDraftDetail>;
  suggest(id: string, req: AdminSuggestRequest): Promise<AdminSuggestResult>;
  library(): Promise<AdminLibrary>;
  knowledge(): Promise<AdminKnowledge>;
  buildKnowledge(draftIds: string[]): Promise<AdminKnowledgeBuild>;
  activateKnowledge(knowledgeVersion: string): Promise<AdminKnowledge>;
  knowledgeChunks(knowledgeVersion: string): Promise<AdminKnowledgeChunks>;
  users(): Promise<AdminUsers>;
  createUser(req: AdminUserRequest): Promise<AdminUser>;
  updateUser(id: string, req: AdminUserRequest): Promise<AdminUser>;
  documents(): Promise<AdminDocuments>;
  updateDocument(id: string, req: AdminDocumentUpdateRequest): Promise<AdminImport>;
  translations(): Promise<AdminTranslations>;
  /** Download URL of the Sinhala review sheet (CSV) for one locale file. */
  translationSheetUrl(file: string): string;
  audit(): Promise<AdminAudit>;
  settings(): Promise<AdminSettings>;
}

interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

const listOf = <T>(item: Parser<T>): Parser<T[]> => ({
  safeParse: (value) => {
    if (!Array.isArray(value)) return { success: false };
    const out: T[] = [];
    for (const v of value) {
      const parsed = item.safeParse(v);
      if (!parsed.success) return { success: false };
      out.push(parsed.data);
    }
    return { success: true, data: out };
  },
});

/** Browser upload with real progress events (fetch cannot report upload progress). */
export const xhrUploader: Uploader = (url, file, onProgress) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/pdf');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: unknown;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => reject(new EngineError('network_unavailable', null, true));
    xhr.send(file);
  });

const toResult = <T>(status: number, body: unknown, schema: Parser<T>): T => {
  if (status < 200 || status >= 300) {
    const parsed = ApiErrorSchema.safeParse(body);
    if (!parsed.success) throw new EngineError('invalid_response', status, status >= 500);
    const e = parsed.data.error;
    throw new EngineError(e.code, status, e.retryable, e.details ?? {}, e.correlationId);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new EngineError('invalid_response', status, false);
  return parsed.data;
};

export const createAdminClient = ({
  baseUrl,
  fetch: fetchImpl,
  uploader = xhrUploader,
}: {
  baseUrl: string;
  fetch?: typeof fetch;
  uploader?: Uploader;
}): AdminClient => {
  const doFetch = fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const root = `${baseUrl.replace(/\/+$/, '')}/admin/dev`;
  // A hung backend request (e.g. a stalled database connection) must not leave the admin console
  // spinning on "Loading..." forever; fail it after a bound and let the UI show "unavailable".
  const REQUEST_TIMEOUT_MS = 15_000;
  const call = async <T>(
    method: string,
    path: string,
    schema: Parser<T>,
    body?: unknown,
  ): Promise<T> => {
    let response: Response;
    try {
      response = await doFetch(`${root}${path}`, {
        method,
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new EngineError('network_unavailable', null, true);
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    return toResult(response.status, json, schema);
  };
  const id = (draftId: string) => `/drafts/${encodeURIComponent(draftId)}`;

  return {
    simulationModels: () => call('GET', '/simulation-models', listOf(TeachingRecordSchema)),
    saveSimulationModel: (recordId, expectedVersion, definition) =>
      call(
        recordId ? 'PUT' : 'POST',
        recordId ? `/simulation-models/${encodeURIComponent(recordId)}` : '/simulation-models',
        TeachingRecordSchema,
        { expectedVersion, definition },
      ),
    activateLocalSimulation: (recordId, expectedVersion, reviewer) =>
      call(
        'POST',
        `/simulation-models/${encodeURIComponent(recordId)}/activate-local`,
        TeachingRecordSchema,
        { expectedVersion, reviewer, reviewedSources: true },
      ),
    deactivateLocalSimulation: (recordId, expectedVersion) =>
      call(
        'POST',
        `/simulation-models/${encodeURIComponent(recordId)}/deactivate-local`,
        TeachingRecordSchema,
        { expectedVersion },
      ),
    status: () => call('GET', '/status', AdminStatusSchema),
    drafts: () => call('GET', '/drafts', listOf(AdminDraftSummarySchema)),
    draft: (draftId) => call('GET', id(draftId), AdminDraftDetailSchema),
    upload: async (kind, file, onProgress) => {
      const url = `${root}/imports?kind=${kind}&filename=${encodeURIComponent(file.name)}`;
      const { status, body } = await uploader(url, file, onProgress);
      return toResult(status, body, AdminImportResultSchema);
    },
    update: (draftId, req) => call('PUT', id(draftId), AdminDraftDetailSchema, req),
    validate: (draftId) => call('POST', `${id(draftId)}/validate`, AdminDraftDetailSchema),
    review: (draftId, req) => call('POST', `${id(draftId)}/review`, AdminDraftDetailSchema, req),
    suggest: (draftId, req) =>
      call('POST', `${id(draftId)}/suggest`, AdminSuggestResultSchema, req),
    library: () => call('GET', '/library', AdminLibrarySchema),
    knowledge: () => call('GET', '/knowledge', AdminKnowledgeSchema),
    buildKnowledge: (draftIds) =>
      call('POST', '/knowledge/builds', AdminKnowledgeBuildSchema, { draftIds }),
    activateKnowledge: (knowledgeVersion) =>
      call('POST', '/knowledge/activate', AdminKnowledgeSchema, { knowledgeVersion }),
    knowledgeChunks: (version) =>
      call('GET', `/knowledge/${encodeURIComponent(version)}/chunks`, AdminKnowledgeChunksSchema),
    users: () => call('GET', '/users', AdminUsersSchema),
    createUser: (req) => call('POST', '/users', AdminUserSchema, req),
    updateUser: (userId, req) =>
      call('PUT', `/users/${encodeURIComponent(userId)}`, AdminUserSchema, req),
    documents: () => call('GET', '/documents', AdminDocumentsSchema),
    updateDocument: (importId, req) =>
      call('PUT', `/documents/${encodeURIComponent(importId)}`, AdminImportSchema, req),
    translations: () => call('GET', '/translations', AdminTranslationsSchema),
    translationSheetUrl: (file) => `${root}/translations/${encodeURIComponent(file)}.csv`,
    audit: () => call('GET', '/audit', AdminAuditSchema),
    settings: () => call('GET', '/settings', AdminSettingsSchema),
  };
};
