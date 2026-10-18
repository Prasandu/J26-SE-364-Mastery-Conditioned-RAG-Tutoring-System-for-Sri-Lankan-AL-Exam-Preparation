import { request } from "./client";
import { getAccessToken } from "../auth/supabase";

const planningApiBaseUrl =
  import.meta.env.VITE_PLANNING_API_URL || import.meta.env.VITE_API_URL;

function planningRequest<T>(path: string, init?: RequestInit) {
  return getAccessToken().then((accessToken) =>
    request<T>(
      path,
      {
        ...init,
        headers: {
          ...init?.headers,
          Authorization: `Bearer ${accessToken}`,
        },
      },
      planningApiBaseUrl,
    ),
  );
}

export interface AvailabilityWindow {
  weekday: number;
  start_time: string;
  end_time: string;
}

export interface FixedCommitment {
  label: string;
  start_at: string;
  end_at: string;
}

export interface TopicPriorityInput {
  topic_id: string;
  priority: number;
}

export interface PlanInput {
  mode: "manual" | "predicted";
  exam_date: string;
  target_grade: string;
  topics: string[];
  availability_windows: AvailabilityWindow[];
  max_session_minutes: number;
  max_daily_minutes: number;
  timezone: string;
  preferred_times: string[];
  fixed_commitments: FixedCommitment[];
  priorities: TopicPriorityInput[];
}

export interface PlanResponse {
  id: string;
  mode: "manual" | "predicted";
  exam_date: string;
  target_grade: string;
  constraints: Record<string, unknown>;
  achievability?: AchievabilityReport | null;
}

export interface AchievabilityReport {
  status: "on_track" | "stretch" | "out_of_reach";
  best_range_grade: string;
  hours_needed: number;
  hours_available: number;
  hours_gap: number;
  projected_range: {
    low: number;
    expected: number;
    high: number;
  };
  message: string;
}

export interface PlanListResponse {
  plans: PlanResponse[];
}

export interface ScheduledTask {
  id: string | null;
  topic_id: string;
  activity: string;
  start_at: string;
  duration_min: number;
  status: string;
  reason: string;
  priority: number;
  replanned_from: string | null;
}

export interface GenerateScheduleRequest {
  horizon_days: number;
}

export interface ScheduleResponse {
  tasks: ScheduledTask[];
  infeasible: boolean;
  shortfall_minutes: number;
  unscheduled_minutes: Record<string, number>;
}

export type TaskStatus = "completed" | "partial" | "missed";

export interface TaskStatusUpdate {
  status: TaskStatus;
  actual_duration_min?: number | null;
  score_before?: number | null;
  score_after?: number | null;
}

export interface TaskStatusResponse {
  task: ScheduledTask;
  score_change: number | null;
  planned_minutes: number;
  actual_minutes: number;
  replanned: boolean;
  schedule: ScheduleResponse | null;
}

export interface WeeklyReplanResponse {
  plan_id: string;
  analyzed_from: string;
  analyzed_until: string;
  planned_minutes: number;
  completed_minutes: number;
  adherence: number | null;
  average_score_change: number | null;
  predictions_created: number;
  schedule: ScheduleResponse;
}

export interface DashboardTopicTrend {
  topic_id: string;
  topic_name: string | null;
  parent_topic_id: string | null;
  mastery: number;
  trend: number;
}

export interface DashboardMasteryHistoryPoint {
  week_start: string;
  topic_id: string;
  topic_name: string | null;
  mastery: number;
}

export interface WeakTopic {
  topic_id: string;
  topic_name: string | null;
  mastery: number;
  weakness_score: number;
  reason: string;
}

export interface DeclineAlert {
  topic_id: string;
  baseline: number;
  recent: number;
  drop: number;
  attempts: {
    score: number;
    max_score: number;
    attempted_at: string;
    paper_id: string | null;
    question_id: string | null;
  }[];
  latest_attempt_at: string;
  message: string;
}

export interface DashboardResponse {
  minimum_assessed_topics: number;
  exam_countdown_days: number;
  has_exam_plan: boolean;
  adherence: number;
  adherence_pct: number;
  has_adherence_data: boolean;
  mastery_trend: DashboardTopicTrend[];
  mastery_history: DashboardMasteryHistoryPoint[];
  has_mastery_data: boolean;
  weak_topics: WeakTopic[];
  alerts: DeclineAlert[];
  predicted_grade: string;
  target_grade: string;
  gap_to_target: number;
  grade_gap_to_target: number;
  predicted_score: number;
  readiness_score: number;
  current_prediction: number;
  has_prediction: boolean;
  achievability: AchievabilityReport | null;
}

export interface WhatIfInput {
  extra_hours_per_week?: number;
  mastery_gain?: number;
  hours_per_week?: number;
}

export interface WhatIfResponse {
  current_prediction: number;
  current_grade: string;
  projected_prediction: number;
  projected_grade: string;
  gain: number;
  change: number;
  estimate: boolean;
  target_grade: string | null;
  gap_to_target: number | null;
}

export function createPlan(data: PlanInput) {
  return planningRequest<PlanResponse>("/api/v1/plans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function replacePlan(planId: string, data: PlanInput) {
  return planningRequest<PlanResponse>(
    `/api/v1/plans/${encodeURIComponent(planId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
}

export function getPlans() {
  return planningRequest<PlanListResponse>("/api/v1/plans");
}

export function getSchedule(planId: string) {
  return planningRequest<ScheduleResponse>(
    `/api/v1/plans/${encodeURIComponent(planId)}/schedule`,
  );
}

export function generateSchedule(planId: string, horizonDays = 14) {
  return planningRequest<ScheduleResponse>(
    `/api/v1/plans/${encodeURIComponent(planId)}/generate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ horizon_days: horizonDays }),
    },
  );
}

export function updateTaskStatus(taskId: string, data: TaskStatusUpdate) {
  return planningRequest<TaskStatusResponse>(
    `/api/v1/tasks/${encodeURIComponent(taskId)}/status`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
}

export function refreshWeeklyPlan(planId: string) {
  return planningRequest<WeeklyReplanResponse>(
    `/api/v1/plans/${encodeURIComponent(planId)}/weekly-replan`,
    { method: "POST" },
  );
}

export function getDashboard() {
  return planningRequest<DashboardResponse>("/api/v1/dashboard");
}

export function submitWhatIf(data: WhatIfInput) {
  return planningRequest<WhatIfResponse>("/api/v1/whatif", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}
