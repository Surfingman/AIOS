export type AgeGroup = "7-9" | "10-12" | "13-15" | "adult";
export type OrbState = "idle" | "listening" | "thinking" | "speaking";
export type ResultStatus = "ok" | "blocked" | "error";

export const CAPABILITY_IDS = ["calendar", "web_search", "device_control", "files", "health"] as const;
export type CapabilityId = (typeof CAPABILITY_IDS)[number];

export const CAPABILITY_LABELS: Record<CapabilityId, string> = {
  calendar: "📅 일정",
  web_search: "🔍 검색 / 질문",
  device_control: "🎛️ 기기 제어",
  files: "📁 파일",
  health: "❤️ 건강",
};

export interface ChildProfile {
  child_id: string;
  name: string;
  age_group: AgeGroup;
}

export interface ParentPolicy {
  child_id: string;
  allowed_capabilities: string[];
  allowed_domains: string[];
  blocked_domains: string[];
  attention_sensing_enabled: boolean;
}

export interface Intent {
  capability: string;
  action: string;
  parameters: Record<string, unknown>;
  raw_text: string;
}

export interface SafetyVerdict {
  allowed: boolean;
  reason: string;
  risk_level: "none" | "low" | "medium" | "high";
  checked_url?: string;
  signals: string[];
}

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
}

export interface CapabilityResult {
  capability: string;
  action: string;
  status: ResultStatus;
  card: Record<string, any>;
  safety?: SafetyVerdict;
  policy?: PolicyDecision;
}

export interface OrchestratorResponse {
  session_id: string;
  orb_state: OrbState;
  intents: Intent[];
  results: CapabilityResult[];
}

export interface Turn {
  text: string;
  results: CapabilityResult[];
}
