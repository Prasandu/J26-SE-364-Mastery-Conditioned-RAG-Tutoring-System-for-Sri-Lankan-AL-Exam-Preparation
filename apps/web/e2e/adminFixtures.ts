import {
  AdminDraftDetailSchema,
  AdminImportResultSchema,
  AdminKnowledgeBuildSchema,
  AdminKnowledgeSchema,
} from '@vlab/contracts';
import { expect, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ADMIN_API = 'http://127.0.0.1:8013/admin/dev';
const API = ADMIN_API;

export async function prepareVersions(request: APIRequestContext) {
  const current = AdminKnowledgeSchema.parse(await (await request.get(`${API}/knowledge`)).json());
  if (current.active && current.builds.some((build) => build.status === 'staged')) return;
  // Existing review/build operations against temporary file storage with fake embeddings and disabled AI.
  const imported = await request.post(`${API}/imports?kind=guide&filename=synthetic-guide.pdf`, {
    headers: { 'Content-Type': 'application/pdf' },
    data: readFileSync(fileURLToPath(new URL('./fixtures/synthetic-guide.pdf', import.meta.url))),
  });
  expect(imported.ok(), await imported.text()).toBe(true);
  const drafts = AdminImportResultSchema.parse(await imported.json()).drafts;
  for (const draft of drafts) {
    const fixed = await request.post(`${API}/drafts/${draft.id}/review`, {
      data: { expectedVersion: draft.version, action: 'quick_fix', field: null, reviewed: null },
    });
    expect(fixed.ok(), await fixed.text()).toBe(true);
    const detail = AdminDraftDetailSchema.parse(await fixed.json());
    const approved = await request.post(`${API}/drafts/${draft.id}/review`, {
      data: {
        expectedVersion: detail.draft.version,
        action: 'quick_approve',
        field: null,
        reviewed: null,
      },
    });
    expect(approved.ok(), await approved.text()).toBe(true);
  }
  const first = await request.post(`${API}/knowledge/builds`, {
    data: { draftIds: [drafts[0]!.id] },
  });
  expect(first.ok(), await first.text()).toBe(true);
  const built = AdminKnowledgeBuildSchema.parse(await first.json());
  const active = await request.post(`${API}/knowledge/activate`, {
    data: { knowledgeVersion: built.knowledgeVersion },
  });
  expect(active.ok(), await active.text()).toBe(true);
  const staged = await request.post(`${API}/knowledge/builds`, {
    data: { draftIds: [drafts[1]!.id] },
  });
  expect(staged.ok(), await staged.text()).toBe(true);
}
