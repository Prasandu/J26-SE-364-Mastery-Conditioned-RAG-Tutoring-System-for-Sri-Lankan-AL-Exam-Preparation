import type { AvailabilityWindow, PlanInput } from "../../api/planning";

export interface PlanFormValues {
  mode: PlanInput["mode"];
  examDate: string;
  targetGrade: string;
  topics: string[];
  availability: AvailabilityWindow[];
  maxSessionMinutes: number;
  maxDailyMinutes?: number;
}

export function validatePlanForm(
  values: PlanFormValues,
  today = new Date().toISOString().slice(0, 10),
): string[] {
  const errors: string[] = [];
  if (!values.examDate || values.examDate <= today) {
    errors.push("Choose an exam date in the future.");
  }
  if (!["A", "B", "C", "S", "F"].includes(values.targetGrade)) {
    errors.push("Choose a valid target grade.");
  }
  if (
    values.mode === "manual" &&
    new Set(values.topics).size !== values.topics.length
  ) {
    errors.push("Remove duplicate topics.");
  }
  if (values.mode === "manual" && values.topics.length === 0) {
    errors.push("Choose at least one topic for a manual plan.");
  }
  if (values.maxSessionMinutes < 15 || values.maxSessionMinutes > 180) {
    errors.push("Session length must be between 15 and 180 minutes.");
  }
  if (values.maxDailyMinutes !== undefined) {
    if (values.maxDailyMinutes < 15 || values.maxDailyMinutes > 600) {
      errors.push("Daily study limit must be between 15 minutes and 10 hours.");
    } else if (values.maxDailyMinutes < values.maxSessionMinutes) {
      errors.push("Daily study limit cannot be shorter than one session.");
    }
  }
  if (values.availability.length === 0) {
    errors.push("Add at least one weekly availability window.");
  }

  const byWeekday = new Map<number, AvailabilityWindow[]>();
  for (const window of values.availability) {
    if (
      window.weekday < 0 ||
      window.weekday > 6 ||
      !isValidTime(window.start_time) ||
      !isValidTime(window.end_time) ||
      window.start_time >= window.end_time
    ) {
      errors.push("Each availability window needs a valid day and end after start.");
      continue;
    }
    const windows = byWeekday.get(window.weekday) ?? [];
    windows.push(window);
    byWeekday.set(window.weekday, windows);
  }

  for (const windows of byWeekday.values()) {
    const ordered = [...windows].sort((left, right) =>
      left.start_time.localeCompare(right.start_time),
    );
    for (let index = 1; index < ordered.length; index += 1) {
      if (ordered[index].start_time < ordered[index - 1].end_time) {
        errors.push("Availability windows on the same day cannot overlap.");
        break;
      }
    }
  }
  return [...new Set(errors)];
}

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value);
}
