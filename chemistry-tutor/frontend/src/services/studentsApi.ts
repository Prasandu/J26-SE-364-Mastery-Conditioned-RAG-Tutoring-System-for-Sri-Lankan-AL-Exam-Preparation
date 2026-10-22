import { authFetch } from "./apiClient";
import type { Consultation } from "../types/consultation";
import type { Dashboard, InterventionHistoryItem } from "../types/dashboard";
import type { Intervention } from "../types/intervention";
import type { WivaranaReport } from "../types/report";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export async function getInterventions(studentId: string): Promise<Intervention[]> {
  const res = await authFetch(`${API_BASE_URL}/api/v1/students/${studentId}/interventions`);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export async function getDashboard(studentId: string): Promise<Dashboard> {
  const res = await authFetch(`${API_BASE_URL}/api/v1/students/${studentId}/dashboard`);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export async function getConsultation(studentId: string): Promise<Consultation> {
  const res = await authFetch(`${API_BASE_URL}/api/v1/students/${studentId}/consultation`);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export async function getInterventionHistory(
  studentId: string,
): Promise<InterventionHistoryItem[]> {
  const res = await authFetch(`${API_BASE_URL}/api/v1/students/${studentId}/intervention-history`);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export async function getWivaranaReport(studentId: string): Promise<WivaranaReport> {
  const res = await authFetch(`${API_BASE_URL}/api/v1/students/${studentId}/wivarana-report`);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}
