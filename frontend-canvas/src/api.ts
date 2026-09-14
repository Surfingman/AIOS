import type { AgeGroup, OrchestratorResponse, ParentPolicy } from "./types";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`요청 실패 (${response.status}): ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

export function createSession(name: string, age_group: AgeGroup) {
  return jsonFetch<{
    session_id: string;
    profile: unknown;
    policy: ParentPolicy;
  }>("/api/session", {
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

export function getPolicy(session_id: string) {
  return jsonFetch<ParentPolicy>(`/api/policy/${session_id}`);
}

export function updatePolicy(session_id: string, policy: ParentPolicy) {
  return jsonFetch<ParentPolicy>(`/api/policy/${session_id}`, {
    method: "PUT",
    body: JSON.stringify(policy),
  });
}

export async function uploadHealthScreening(sessionId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`/api/health/${sessionId}/screening`, {
    method: "POST",
    body: form,
    headers: authHeaders(),
  });
  if (!response.ok)
    throw new Error(
      `업로드 실패 (${response.status}): ${await response.text()}`,
    );
  return response.json();
}

export function confirmHealthScreening(
  sessionId: string,
  body: Record<string, unknown>,
) {
  return jsonFetch<{
    profile: Record<string, unknown>;
    card: Record<string, any>;
  }>(`/api/health/${sessionId}/confirm`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function authHeaders(): Record<string, string> {
  const token = sessionStorage.getItem("guardian-token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function workspaceApi<T = any>(
  path = "",
  method = "GET",
  body?: unknown,
): Promise<T> {
  return jsonFetch<T>(`/api/workspace${path}`, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

let opening: Promise<void> | null = null;
export async function openWorkspace() {
  if (!opening) {
    opening = (async () => {
      if (sessionStorage.getItem("guardian-token")) {
        const response = await fetch("/api/workspace", {
          headers: authHeaders(),
        });
        if (response.ok) return;
        if (response.status !== 401)
          throw new Error("작업 공간에 연결할 수 없습니다.");
        sessionStorage.removeItem("guardian-token");
      }
      const created = await workspaceApi<{ token: string }>("/new", "POST", {
        name: "나",
      });
      sessionStorage.setItem("guardian-token", created.token);
    })().finally(() => {
      opening = null;
    });
  }
  await opening;
}
