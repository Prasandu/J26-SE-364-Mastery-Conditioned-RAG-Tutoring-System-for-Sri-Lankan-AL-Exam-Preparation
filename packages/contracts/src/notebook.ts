import { z } from 'zod';
import { UnitSchema } from './common';

/**
 * Digital laboratory notebook. Plain text only: markup is rejected. Student writing is stored as
 * entered and never translated or rewritten by the system.
 */
const NO_MARKUP = /^(?![\s\S]*<[A-Za-z/!?])[\s\S]*$/;
const text = (max: number) => z.string().max(max).regex(NO_MARKUP, 'plain text only');

export const NOTEBOOK_LIMITS = {
  shortText: 200,
  mediumText: 2000,
  longText: 5000,
  listItems: 30,
  measurementRows: 50,
} as const;

export const NotebookMeasurementSchema = z.strictObject({
  label: text(120),
  trial: z.int().min(1).max(10).nullable(),
  value: z.number().finite().nullable(),
  unit: UnitSchema.nullable(),
  note: text(300),
});

export const NotebookDocumentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  experimentDate: z.iso.date().nullable(),
  aim: text(NOTEBOOK_LIMITS.mediumText),
  apparatus: z.array(text(NOTEBOOK_LIMITS.shortText)).max(NOTEBOOK_LIMITS.listItems),
  chemicals: z.array(text(NOTEBOOK_LIMITS.shortText)).max(NOTEBOOK_LIMITS.listItems),
  procedure: text(NOTEBOOK_LIMITS.longText),
  observations: text(NOTEBOOK_LIMITS.longText),
  measurements: z.array(NotebookMeasurementSchema).max(NOTEBOOK_LIMITS.measurementRows),
  calculations: text(NOTEBOOK_LIMITS.longText),
  /** Placeholder: Experiment 4 has no graph; free-text notes only. */
  graphNotes: text(NOTEBOOK_LIMITS.mediumText),
  result: text(NOTEBOOK_LIMITS.mediumText),
  discussion: text(NOTEBOOK_LIMITS.longText),
  identifiedErrors: text(NOTEBOOK_LIMITS.longText),
  conclusion: text(NOTEBOOK_LIMITS.mediumText),
});
export type NotebookDocument = z.infer<typeof NotebookDocumentSchema>;

export const emptyNotebook = (experimentDate: string | null): NotebookDocument => ({
  schemaVersion: 1,
  experimentDate,
  aim: '',
  apparatus: [],
  chemicals: [],
  procedure: '',
  observations: '',
  measurements: [],
  calculations: '',
  graphNotes: '',
  result: '',
  discussion: '',
  identifiedErrors: '',
  conclusion: '',
});

export const NotebookStateSchema = z.strictObject({
  /** 0 = never saved. */
  version: z.int().nonnegative(),
  document: NotebookDocumentSchema.nullable(),
  updatedAt: z.iso.datetime().nullable(),
});
export type NotebookState = z.infer<typeof NotebookStateSchema>;
