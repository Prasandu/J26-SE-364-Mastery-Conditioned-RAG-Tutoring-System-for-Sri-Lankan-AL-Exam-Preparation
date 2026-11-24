// Turning a paper into the flat list of things a student actually answers.
// Pure functions, no React, so they are easy to test.

import type { AnswerMode, PaperDetail, Question } from "@/api/types";

export interface Answerable {
  question: Question;
  label: string; // full label, e.g. "2(a)"
  sectionCode: string;
  mode: AnswerMode;
  stem: string[]; // the parent questions' wording, for context
}

/**
 * Only leaf questions are answered. A question with sub-questions is just a
 * heading, so its wording is carried down to its parts as `stem`.
 */
export function answerableQuestions(paper: PaperDetail): Answerable[] {
  return paper.sections.flatMap((section) =>
    walk(section.questions, section.code, section.answer_mode, "", []),
  );
}

function walk(
  questions: Question[],
  sectionCode: string,
  mode: AnswerMode,
  parentLabel: string,
  stem: string[],
): Answerable[] {
  return questions.flatMap((question) => {
    const label = parentLabel + question.label;
    if (question.sub_questions.length === 0) {
      return [{ question, label, sectionCode, mode, stem }];
    }
    const deeper = question.text ? [...stem, `${label} ${question.text}`] : stem;
    return walk(question.sub_questions, sectionCode, mode, label, deeper);
  });
}

/** MCQ questions are answered by clicking; everything else by writing. A past
 * paper's own question can be MCQ with no options recorded at all (its real
 * options are only printed on the stored PDF, never transcribed) - it is still
 * answered by clicking, just from DEFAULT_MCQ_OPTION_LABELS instead of its own
 * option text; see optionLabels. */
export function isMcq(item: Answerable): boolean {
  return item.mode === "mcq";
}

/** Sri Lankan A/L MCQ papers print five numbered options - the fallback used when
 * nothing in the paper's own data says otherwise (see optionLabels). */
export const DEFAULT_MCQ_OPTION_LABELS = ["1", "2", "3", "4", "5"];

/** The option labels this paper uses, e.g. 1..5 or A..E. */
export function optionLabels(paper: PaperDetail): string[] {
  for (const item of answerableQuestions(paper)) {
    if (item.question.options?.length) {
      return item.question.options.map((option) => option.label);
    }
  }
  return DEFAULT_MCQ_OPTION_LABELS;
}

export function hasMcq(paper: PaperDetail): boolean {
  return paper.sections.some((section) => section.answer_mode === "mcq");
}
