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

/** MCQ questions are answered by clicking; everything else by writing. */
export function isMcq(item: Answerable): boolean {
  return item.mode === "mcq" && (item.question.options?.length ?? 0) > 0;
}
