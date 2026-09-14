export type Snapshot = { session_id: string; name: string; age_group: string; consents: Record<string, boolean>; tasks: { status: string }[]; alerts: unknown[]; ai_configured: boolean }
export async function api<T>(path = '', method = 'GET', body?: unknown): Promise<T> {
  const token = sessionStorage.getItem('guardian-token')
  const response = await fetch(`/api/workspace${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  if (!response.ok) { const message = await response.json().catch(() => ({})); throw new Error(typeof message.detail === 'string' ? message.detail : `요청 실패 (${response.status})`) }
  return response.json()
}
let opening: Promise<Snapshot> | null = null
export function connect() {
  if (!opening) opening = (async () => {
    const token = sessionStorage.getItem('guardian-token')
    if (token) {
      const response = await fetch('/api/workspace', { headers: { Authorization: `Bearer ${token}` } })
      if (response.ok) return response.json() as Promise<Snapshot>
      if (response.status !== 401) throw new Error('백엔드 연결을 확인하세요.')
    }
    const created = await api<{ token: string }>('/new', 'POST', { name: '나' })
    sessionStorage.setItem('guardian-token', created.token)
    return api<Snapshot>()
  })().finally(() => { opening = null })
  return opening
}