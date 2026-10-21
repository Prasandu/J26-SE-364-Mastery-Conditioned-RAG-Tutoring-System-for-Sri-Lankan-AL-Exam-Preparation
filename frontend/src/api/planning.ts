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
  student_name: string;
  coaching_message: CoachingMessage;
  achievability?: AchievabilityReport | null;
}

export interface CoachingMessage {
  greeting: string;
  headline: string;
  body: string;
  focus_topics: {
    topic: string;
    reason: string;
  }[];
  daily_suggestion: string;
  tone: "on_track" | "stretch" | "ambitious";
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
  reason_details?: TaskReason | null;
  steps?: TaskStep[];
  priority: number;
  replanned_from: string | null;
  timer_state?: TimerState;
  timer_started_at?: string | null;
  timer_elapsed_sec?: number;
  can_undo?: boolean;
}

export interface UndoOutcomeResponse {
  task: ScheduledTask;
  removed_task_ids: string[];
}

export function undoTaskOutcome(taskId: string) {
  return planningRequest<UndoOutcomeResponse>(
    `/api/v1/tasks/${encodeURIComponent(taskId)}/undo`,
    { method: "POST" },
  );
}

export type TimerState = "idle" | "running" | "paused" | "finished";

export type TimerAction = "start" | "pause" | "resume" | "finish";

export interface TimerResponse {
  task: ScheduledTask;
  paused_task: ScheduledTask | null;
  message: string | null;
  measured_minutes: number | null;
  suggested_actual_minutes: number | null;
  requires_confirmation: boolean;
  confirmation_reason: string | null;
}

export interface TaskReason {
  topic: string;
  sub_topic: string | null;
  mastery: number;
  has_evidence?: boolean;
  reason?: string;
  trend: number;
  decline_alert: {
    baseline: number;
    recent: number;
    drop: number;
    message: string;
  } | null;
  exam_weight: number;
  days_to_exam: number;
  main_factors: Record<string, number>;
  activity_recommendation: string;
  final_week?: boolean;
}

export interface TaskStep {
  kind: "theory" | "practice" | "review";
  minutes: number;
  question_ids: string[];
}

export interface GenerateScheduleRequest {
  horizon_days?: number;
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
  compressed?: boolean;
  deferred_topics?: string[];
  restored_topics?: string[];
  explanation?: string | null;
}

export interface RoadmapTopic {
  topic_id: string;
  topic_name: string;
  hours: number;
  focus: string;
  projected_mastery: number;
}

export interface RoadmapWeek {
  week_start: string;
  week_end: string;
  label: "forecast" | "committed";
  phase: "learning" | "final_revision";
  topics: RoadmapTopic[];
  total_hours: number;
  weeks_to_exam: number;
  compressed: boolean;
  compression_note: string | null;
}

export interface TargetOption {
  grade: string;
  hours_per_day: number;
  label: string;
}

export interface TargetChoice {
  target_grade: string;
  keep_target: TargetOption;
  adjust_goal: TargetOption;
}

export interface RoadmapResponse {
  plan_id: string;
  exam_date: string;
  days_to_exam: number;
  window_days: number;
  window_start: string | null;
  window_end: string | null;
  next_checkpoint: string | null;
  final_week_start: string;
  final_week: boolean;
  checkpoint_due: boolean;
  checkpoint_reason: "window_end" | "new_evidence" | null;
  deferred_topics: { topic_id: string; topic_name: string }[];
  compression_note: string | null;
  target_choice: TargetChoice | null;
  weeks: RoadmapWeek[];
}

export interface RangeChange {
  direction: "up" | "down" | "same";
  previous: number | null;
  current: number;
  message: string;
}

export interface RollingUpdateResponse {
  plan_id: string;
  ran: boolean;
  trigger: "window_end" | "new_evidence" | "manual" | "target_choice" | null;
  adherence: number | null;
  compressed: boolean;
  deferred_topics: string[];
  restored_topics: string[];
  explanation: string | null;
  target_grade: string;
  range_change: RangeChange | null;
  roadmap: RoadmapResponse;
  schedule: ScheduleResponse | null;
}

export type TargetChoiceOption = "keep_target" | "adjust_goal";

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
  student_name: string;
  coaching_message: CoachingMessage;
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
  current_range?: [number, number] | null;
  projected_range?: [number, number] | null;
  extra_total_hours?: number | null;
  days_remaining?: number | null;
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

export function generateSchedule(planId: string, horizonDays?: number) {
  const body: GenerateScheduleRequest =
    horizonDays === undefined ? {} : { horizon_days: horizonDays };
  return planningRequest<ScheduleResponse>(
    `/api/v1/plans/${encodeURIComponent(planId)}/generate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export function getRoadmap(planId: string) {
  return planningRequest<RoadmapResponse>(
    `/api/v1/plans/${encodeURIComponent(planId)}/roadmap`,
  );
}

export function runCheckpoint(planId: string, force = false) {
  return planningRequest<RollingUpdateResponse>(
    `/api/v1/plans/${encodeURIComponent(planId)}/checkpoint`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force }),
    },
  );
}

export function chooseTarget(planId: string, choice: TargetChoiceOption) {
  return planningRequest<RollingUpdateResponse>(
    `/api/v1/plans/${encodeURIComponent(planId)}/target-choice`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ choice }),
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

export function timerAction(
  taskId: string,
  action: TimerAction,
  confirmedMinutes?: number,
) {
  return planningRequest<TimerResponse>(
    `/api/v1/tasks/${encodeURIComponent(taskId)}/timer/${action}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        action === "finish" && confirmedMinutes !== undefined
          ? { confirmed_minutes: confirmedMinutes }
          : {},
      ),
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

export type NotificationType = "reminder" | "missed" | "info";

export interface NotificationAction {
  kind: "open_plan" | "reschedule";
  label: string;
  plan_id: string | null;
}

export interface StudyNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  task_id: string | null;
  action: NotificationAction | null;
  created_at: string;
  read_at: string | null;
}

export interface NotificationListResponse {
  notifications: StudyNotification[];
  unread_count: number;
  quiet_hours_active: boolean;
}

export interface NotificationPreferences {
  reminder_lead_minutes: number;
  quiet_hours_start: string;
  quiet_hours_end: string;
  enabled: boolean;
}

export function getNotifications() {
  return planningRequest<NotificationListResponse>("/api/v1/notifications");
}

export function markNotificationRead(notificationId: string) {
  return planningRequest<StudyNotification>(
    `/api/v1/notifications/${encodeURIComponent(notificationId)}/read`,
    { method: "POST" },
  );
}

export function getNotificationPreferences() {
  return planningRequest<NotificationPreferences>(
    "/api/v1/notifications/preferences",
  );
}

export function updateNotificationPreferences(data: NotificationPreferences) {
  return planningRequest<NotificationPreferences>(
    "/api/v1/notifications/preferences",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
}

export type MotivationCategory =
  | "effort"
  | "consistency"
  | "recovery"
  | "exam_week"
  | "celebration";

export interface MotivationMessage {
  date: string;
  category: MotivationCategory | null;
  message_id: string | null;
  text: string | null;
  suppressed: boolean;
}

export function getMotivationToday() {
  return planningRequest<MotivationMessage>("/api/v1/motivation/today");
}
