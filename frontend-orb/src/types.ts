export type AgeGroup = "7-9" | "10-12" | "13-15";
export type OrbState = "idle" | "listening" | "thinking" | "speaking";
export type ResultStatus = "ok" | "blocked" | "error";

export const CAPABILITY_IDS = ["calendar", "web_search", "device_control", "files"] as const;
export type CapabilityId = (typeof CAPABILITY_IDS)[number];

export const CAPABILITY_META: Record<CapabilityId, { emoji: string; label: string; example: string }> = {
  calendar: { emoji: "📅", label: "일정", example: "내일 오후 3시에 축구 약속 잡아줘" },
  web_search: { emoji: "🔍", label: "검색/질문", example: "화산은 어떻게 생겨?" },
  device_control: { emoji: "🎛️", label: "기기 제어", example: "볼륨 높여줘" },
  files: { emoji: "📁", label: "파일", example: "내 파일 보여줘" },
};

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
