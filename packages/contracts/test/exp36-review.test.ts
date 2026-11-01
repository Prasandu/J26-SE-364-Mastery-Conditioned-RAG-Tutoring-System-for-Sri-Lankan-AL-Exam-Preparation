import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type ReviewPackage = {
  status: string;
  runnable: boolean;
  ragApproved: boolean;
  source: {
    sourceId: string;
    sha256: string;
    pages: Array<{ pdfPage: number; printedPage: number }>;
  };
  experiment: {
    number: number;
    title: string;
    unit: string;
  };
  calculations: {
    status: string;
    officialResultsProvided: boolean;
  };
  safetyReview: {
    runnableSafetyRulesApproved: boolean;
  };
  teacherApproval: {
    required: boolean;
    items: string[];
  };
  implementationBoundary: {
    registrationAllowed: boolean;
    activeCatalogChangeAllowed: boolean;
    activeRagManifestChangeAllowed: boolean;
  };
};

const review = JSON.parse(
  readFileSync(
    new URL('../../../docs/reviews/exp36/source-normalization.v1.json', import.meta.url),
    'utf8',
  ),
) as ReviewPackage;

describe('Experiment 36 E4.5 review package', () => {
  it('is source-traceable and covers only handbook pages 119–121', () => {
    expect(review.source).toMatchObject({
      sourceId: 'nie-handbook-2018',
      sha256: '1d32553317439d992adccc75ba905f98e35b87536607362736f175722ab9fcbe',
    });
    expect(review.source.pages).toEqual([
      { pdfPage: 119, printedPage: 111 },
      { pdfPage: 120, printedPage: 112 },
      { pdfPage: 121, printedPage: 113 },
    ]);
  });

  it('records the official identity without making it runnable', () => {
    expect(review.experiment).toMatchObject({
      number: 36,
      title: 'Titration between Na₂CO₃ and HCl using phenolphthalein and methyl orange',
      unit: 'Unit 12 — Equilibrium',
    });
    expect(review.status).toBe('teacher-review-pending');
    expect(review.runnable).toBe(false);
    expect(review.ragApproved).toBe(false);
  });

  it('keeps derived calculations conditional and does not claim official results', () => {
    expect(review.calculations).toMatchObject({
      status: 'conditional_derived',
      officialResultsProvided: false,
    });
  });

  it('keeps experiment-specific safety and registration blocked', () => {
    expect(review.safetyReview.runnableSafetyRulesApproved).toBe(false);
    expect(review.teacherApproval.required).toBe(true);
    expect(review.teacherApproval.items.length).toBeGreaterThanOrEqual(8);
    expect(review.implementationBoundary).toMatchObject({
      registrationAllowed: false,
      activeCatalogChangeAllowed: false,
      activeRagManifestChangeAllowed: false,
    });
  });
});
