import type { AgeGroup, OrchestratorResponse, ParentPolicy } from "./types";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`요청 실패 (${response.status}): ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

export function createSession(name: string, age_group: AgeGroup) {
  return jsonFetch<{ session_id: string; profile: unknown; policy: ParentPolicy }>("/api/session", {
    method: "POST",
    body: JSON.stringify({ name, age_group }),
  });
}

export function sendIntent(session_id: string, text: string) {
  return jsonFetch<OrchestratorResponse>("/api/intent", {
    method: "POST",
    body: JSON.stringify({ session_id, text }),
  });
}
