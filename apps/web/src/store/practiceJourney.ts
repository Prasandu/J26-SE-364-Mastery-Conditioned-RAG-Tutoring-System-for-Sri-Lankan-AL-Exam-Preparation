export const PRACTICE_STAGES = [
  'overview',
  'prelab',
  'setup',
  'workbench',
  'notebook',
  'reflection',
  'report',
] as const;
export type PracticeStage = (typeof PRACTICE_STAGES)[number];

/** Learner writing and navigation, separate from authoritative chemistry transitions. */
export interface PracticeJourneyState {
  stage: PracticeStage;
  prelab: Record<string, string>;
  reflection: Record<string, string>;
  prediction: string;
  safety: boolean;
  equipment: boolean;
  started: boolean;
  prelabSkipped: boolean;
}
export const emptyPracticeJourney = (): PracticeJourneyState => ({
  stage: 'overview',
  prelab: {},
  reflection: {},
  prediction: '',
  safety: false,
  equipment: false,
  started: false,
  prelabSkipped: false,
});
