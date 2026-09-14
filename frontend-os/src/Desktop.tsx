import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Activity, ArrowRight, Bell, BookOpen, CalendarDays, ChevronLeft, ChevronRight, FolderOpen, Heart, ImagePlus, LayoutGrid, LockKeyhole, Maximize2, MessageSquare, Mic, Minimize2, Monitor, PanelTop, Search, Send, Settings2, ShieldCheck, Sparkles, Volume2, VolumeX, X } from 'lucide-react'
import OrbScene from './OrbScene'
import type { OrbState } from './OrbScene'
import { api, connect } from './api'
import type { Snapshot } from './api'

const apps = [
  { id: 'overview', label: '일정과 작업', icon: CalendarDays, color: '#8daeff', tag: 'PLAN' },
  { id: 'meeting', label: '회의와 언어', icon: MessageSquare, color: '#6cddc6', tag: 'CONNECT' },
  { id: 'images', label: '이미지 만들기', icon: ImagePlus, color: '#efb974', tag: 'CREATE' },
  { id: 'health', label: '나의 건강', icon: Heart, color: '#eaa2b6', tag: 'WELLNESS' },
  { id: 'memory', label: '기억과 기록', icon: BookOpen, color: '#b1b4ff', tag: 'REMEMBER' },
  { id: 'safety', label: '안전 센터', icon: ShieldCheck, color: '#9bd59e', tag: 'PROTECT' },
  { id: 'settings', label: '연결과 설정', icon: Settings2, color: '#a7c2d0', tag: 'CONTROL' },
]
const localApps = [{ id: 'search', label: '웹 검색', icon: Search }, { id: 'files', label: '내 파일', icon: FolderOpen }, { id: 'device', label: '화면과 접근성', icon: Monitor }]
type Reply = { text: string; mode: string; actions?: { kind: string; title: string }[] }
type Recognition = { lang: string; interimResults: boolean; start: () => void; stop: () => void; abort: () => void; onresult: ((event: { results: { transcript: string }[][] }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null }
const labels: Record<OrbState, string> = { idle: '무엇을 함께 할까요?', listening: '듣고 있어요', thinking: '요청을 살펴보고 있어요', speaking: '이야기하고 있어요' }

export default function Desktop() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [time, setTime] = useState(new Date())
  const [angle, setAngle] = useState(-Math.PI / 2)
  const [active, setActive] = useState<string | null>(null)
  const [opened, setOpened] = useState<string[]>([])
  const [maximized, setMaximized] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [menu, setMenu] = useState(false)
  const [locked, setLocked] = useState(false)
  const [input, setInput] = useState('')
  const [reply, setReply] = useState<Reply | null>(null)
  const [mode, setMode] = useState<OrbState>('idle')
  const [sending, setSending] = useState(false)
  const [voiceConsent, setVoiceConsent] = useState(false)
  const [search, setSearch] = useState('')
  const [searchApproval, setSearchApproval] = useState(false)
  const [searchBusy, setSearchBusy] = useState(false)
  const [file, setFile] = useState<{ name: string; content: string } | null>(null)
  const [large, setLarge] = useState(false)
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [sound, setSound] = useState(false)
  const recognition = useRef<Recognition | null>(null)
  const drag = useRef<{ x: number; angle: number } | null>(null)
  const windowDrag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null)
  const requestBusy = useRef(false)
  const generation = useRef(0)
  const dialog = useRef<HTMLDialogElement>(null)
  const voiceDialog = useRef<HTMLDialogElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [stageSize, setStageSize] = useState({ width: 900, height: 520 })
  async function refresh() { try { setSnapshot(await connect()); setError('') } catch (problem) { setError(String(problem)) } }
  useEffect(() => {
    void refresh()
    const timer = setInterval(() => setTime(new Date()), 1000)
    const onFocus = () => { void refresh() }
    const invalidate = () => { generation.current++ }
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); recognition.current?.abort(); speechSynthesis.cancel(); invalidate() }
  }, [])
  useEffect(() => {
    if (!stage.current) return
    const observer = new ResizeObserver(entries => { const rect = entries[0].contentRect; setStageSize({ width: rect.width, height: rect.height }) })
    observer.observe(stage.current)
    return () => observer.disconnect()
  }, [locked])
  useEffect(() => { if (searchApproval) dialog.current?.showModal(); else dialog.current?.close() }, [searchApproval])
  useEffect(() => { if (voiceConsent) voiceDialog.current?.showModal(); else voiceDialog.current?.close() }, [voiceConsent])
  function openApp(id: string) {
    if (!snapshot) { setError('백엔드 연결 후 다시 열어 주세요.'); return }
    if (![...apps, ...localApps].some(app => app.id === id)) return
    setActive(id); setOpened(current => current.includes(id) ? current : [...current, id]); setMenu(false); setReply(null); setPosition({ x: 0, y: 0 })
  }
  function closeApp() { setOpened(current => current.filter(id => id !== active)); setActive(null); void refresh() }
  async function openSearch() {
    if (searchBusy) return
    const popup = window.open('about:blank', '_blank')
    if (!popup) { setError('브라우저에서 팝업을 허용한 뒤 다시 시도하세요.'); setSearchApproval(false); return }
    popup.opener = null
    setSearchBusy(true)
    const revision = generation.current
    try {
      const result = await api<{ url: string }>('/search', 'POST', { text: search })
      if (revision === generation.current) popup.location.replace(result.url)
      else popup.close()
    } catch (problem) { popup.close(); setError(String(problem)) }
    finally { setSearchBusy(false); setSearchApproval(false) }
  }
  function speak(text: string) {
    speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'ko-KR'
    utterance.onstart = () => setMode('speaking'); utterance.onend = () => setMode('idle'); utterance.onerror = () => setMode('idle')
    speechSynthesis.speak(utterance)
  }
  async function submit() {
    if (!input.trim() || requestBusy.current || !snapshot) return
    requestBusy.current = true; setSending(true); setMode('thinking'); setError('')
    const revision = generation.current; const text = input.trim(); setInput('')
    try {
      const local = /이미지|그림|사진.*만들/.test(text) ? 'images' : /파일/.test(text) ? 'files' : /화면|글씨|글자/.test(text) ? 'device' : null
      const result = local ? { text: '선택한 기능을 열어 내용을 확인해 주세요. 아직 실행하지 않았습니다.', mode: 'rules', actions: [{ kind: local, title: [...apps, ...localApps].find(app => app.id === local)!.label }] } : await api<Reply>('/chat', 'POST', { text })
      if (revision === generation.current) { setReply(result); if (sound) speak(result.text); else setMode('idle') }
    } catch (problem) { if (revision === generation.current) { setError(String(problem)); setMode('idle') } }
    finally { requestBusy.current = false; setSending(false) }
  }
  function startVoice() {
    setVoiceConsent(false)
    const browser = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
    const Engine = browser.SpeechRecognition ?? browser.webkitSpeechRecognition
    if (!Engine) { setError('이 브라우저는 음성 입력을 지원하지 않습니다. 텍스트를 입력하세요.'); return }
    const engine = new Engine(); recognition.current = engine; engine.lang = 'ko-KR'; engine.interimResults = false
    engine.onresult = event => { setInput(event.results[0][0].transcript); setMode('idle') }
    engine.onerror = () => { setError('마이크 권한과 브라우저 음성 서비스를 확인하세요.'); setMode('idle') }
    engine.onend = () => setMode('idle')
    try { engine.start(); setMode('listening') } catch { setError('음성 입력을 시작하지 못했습니다.'); setMode('idle') }
  }
  function lock() { generation.current++; recognition.current?.abort(); speechSynthesis.cancel(); setMode('idle'); setLocked(true); setActive(null); setReply(null); setInput(''); setFile(null); setSearch(''); setMenu(false) }
  const app = [...apps, ...localApps].find(item => item.id === active)
  const pending = snapshot?.tasks.filter(task => task.status === 'pending').length ?? 0
  if (locked) return <main className="lock-screen"><span className="os-wordmark">AIOS</span><time>{time.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</time><p>{time.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}</p><button onClick={() => { setLocked(false); void refresh() }}><ArrowRight />작업 공간으로 돌아가기</button><small>화면 가리기 · Windows 잠금이나 사용자 인증이 아닙니다.</small></main>
  return <main className={`desktop ${large ? 'large-text' : ''}`}>
    <header className="system-bar"><a className="system-brand" href="/os/"><Activity size={19} /><strong>AIOS</strong><span>PERSONAL SPACE</span></a><div className="system-center"><span className={snapshot ? 'online-dot' : 'offline-dot'} />{snapshot ? 'Guardian 연결됨' : '백엔드 연결 중'}</div><div className="system-actions"><button title="알림과 승인" aria-label="알림과 승인" onClick={() => openApp('overview')}><Bell size={17} />{pending > 0 && <b>{pending}</b>}</button><button title="자동 읽기 전환" aria-label="자동 읽기 전환" aria-pressed={sound} onClick={() => { setSound(!sound); speechSynthesis.cancel(); setMode('idle') }}>{sound ? <Volume2 size={18} /> : <VolumeX size={18} />}</button><time>{time.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</time><button title="화면 가리기" aria-label="화면 가리기" onClick={lock}><LockKeyhole size={17} /></button></div></header>
    <section className="desktop-heading"><div><div className="eyebrow">YOUR INTENT. YOUR SPACE.</div><h1>AIOS</h1><p>나의 하루와 연결되는 AI</p></div><button className="profile-chip" onClick={() => openApp('settings')}><span>나</span><div>개인 작업 공간<small>{snapshot?.age_group === 'adult' ? '성인 프로필' : snapshot ? '보호자 정책 적용' : '연결 확인 중'}</small></div><ChevronRight size={16} /></button></section>
    <section className="orb-stage" ref={stage} aria-label="회전하는 기능 선택" onPointerDown={event => { if ((event.target as HTMLElement).closest('button')) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, angle } }} onPointerMove={event => { if (drag.current) setAngle(drag.current.angle + (event.clientX - drag.current.x) * 0.007) }} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
      <div className="orbit-track" /><div className="orbit-track secondary" /><OrbScene state={mode} reduced={reduced} />
      <div className="orb-caption" aria-live="polite"><span className={`state-dot ${mode}`} />{labels[mode]}<small>{mode === 'idle' ? 'GUARDIAN IS HERE' : mode.toUpperCase()}</small></div>
      {apps.map((item, index) => {
        const phase = angle + index * Math.PI * 2 / apps.length; const compact = stageSize.width < 600
        const radiusX = Math.min(stageSize.width * (compact ? 0.36 : 0.33), 390); const radiusY = Math.min(stageSize.height * 0.37, 205)
        return <button className="orbit-app" key={item.id} style={{ left: `calc(50% + ${Math.cos(phase) * radiusX}px)`, top: `calc(46% + ${Math.sin(phase) * radiusY}px)`, '--app-color': item.color } as CSSProperties} onClick={() => openApp(item.id)} title={item.label}><span><item.icon size={compact ? 23 : 28} strokeWidth={1.5} /></span><strong>{item.label}</strong><small>{item.tag}</small></button>
      })}
      <div className="orbit-navigation"><button aria-label="기능 링 왼쪽 회전" title="왼쪽 회전" onClick={() => setAngle(current => current - Math.PI * 2 / apps.length)}><ChevronLeft size={20} /></button><span>MY CAPABILITIES</span><button aria-label="기능 링 오른쪽 회전" title="오른쪽 회전" onClick={() => setAngle(current => current + Math.PI * 2 / apps.length)}><ChevronRight size={20} /></button></div>
    </section>
    <section className="command-area">
      {error && <div className="os-error" role="alert">{error}<button onClick={() => { void refresh() }} aria-label="연결 다시 확인"><ArrowRight size={17} /></button></div>}
      {reply && <div className="reply-panel"><div><span>{reply.mode === 'azure-ai' ? 'Azure AI' : '로컬 제안'}</span><button title="답변 읽기" aria-label="답변 읽기" onClick={() => speak(reply.text)}><Volume2 size={16} /></button><button title="읽기 중지" aria-label="읽기 중지" onClick={() => { speechSynthesis.cancel(); setMode('idle') }}><VolumeX size={16} /></button><button title="답변 닫기" aria-label="답변 닫기" onClick={() => setReply(null)}><X size={16} /></button></div><p>{reply.text}</p><div className="reply-actions">{reply.actions?.map((action, index) => <button key={index} onClick={() => openApp(action.kind === 'schedule' ? 'overview' : action.kind)}><ArrowRight size={15} />{action.title}</button>)}</div></div>}
      <form className="command-bar" onSubmit={event => { event.preventDefault(); void submit() }}><Sparkles size={21} /><input aria-label="AIOS에게 요청" placeholder="무엇을 하고 싶으세요?" maxLength={2000} value={input} onChange={event => setInput(event.target.value)} /><button type="button" aria-label={mode === 'listening' ? '음성 입력 중지' : '음성 입력'} title="음성 입력" disabled={sending} onClick={() => { if (mode === 'listening') recognition.current?.stop(); else setVoiceConsent(true) }}><Mic size={21} /></button><button type="submit" className="send" aria-label="요청 보내기" disabled={!snapshot || !input.trim() || sending}><Send size={19} /></button></form>
      <div className="suggestions"><button onClick={() => openApp('overview')}>오늘 일정<ArrowRight size={12} /></button><button onClick={() => setInput('그림을 만들고 싶어')}>이미지 만들기<ArrowRight size={12} /></button><button onClick={() => openApp('meeting')}>회의 준비<ArrowRight size={12} /></button></div>
    </section>
    <footer className="desktop-footer"><span><ShieldCheck size={14} />승인 기반 · 세션 메모리</span><nav className="dock" aria-label="작업 표시줄"><button className={menu ? 'selected' : ''} title="모든 기능" aria-label="모든 기능" onClick={() => setMenu(!menu)}><LayoutGrid size={23} /></button><i />{opened.length ? opened.map(id => { const entry = [...apps, ...localApps].find(item => item.id === id)!; return <button key={id} aria-label={`${entry.label} 창 복원`} title={entry.label} className={active === id ? 'selected' : ''} onClick={() => setActive(active === id ? null : id)}><entry.icon size={21} /><span className="dock-dot" /></button> }) : <><button title="일정과 작업" aria-label="작업 창 열기" onClick={() => openApp('overview')}><CalendarDays size={22} /></button><button title="내 파일" aria-label="내 파일 열기" onClick={() => openApp('files')}><FolderOpen size={22} /></button><button title="화면과 접근성" aria-label="화면 설정 열기" onClick={() => openApp('device')}><Monitor size={22} /></button></>}</nav><a href="/workspace/"><PanelTop size={15} />2D Canvas</a></footer>
    {menu && <section className="launcher" aria-label="모든 기능 메뉴"><div><strong>내 기능</strong><button aria-label="기능 메뉴 닫기" onClick={() => setMenu(false)}><X size={18} /></button></div>{[...apps, ...localApps].map(item => <button key={item.id} onClick={() => openApp(item.id)}><item.icon size={21} />{item.label}<ChevronRight size={14} /></button>)}</section>}
    {opened.length > 0 && <section hidden={!active} className={`app-window ${maximized ? 'maximized' : ''}`} aria-label={`${app?.label} 작업 창`} style={{ '--window-x': `${position.x}px`, '--window-y': `${position.y}px` } as CSSProperties}>
      <header className="window-titlebar" onDoubleClick={() => setMaximized(!maximized)} onPointerDown={event => { if ((event.target as HTMLElement).closest('button') || maximized || innerWidth < 700) return; event.currentTarget.setPointerCapture(event.pointerId); windowDrag.current = { x: event.clientX, y: event.clientY, startX: position.x, startY: position.y } }} onPointerMove={event => { if (windowDrag.current) setPosition({ x: Math.max(-innerWidth * 0.1, Math.min(innerWidth * 0.1, windowDrag.current.startX + event.clientX - windowDrag.current.x)), y: Math.max(-20, Math.min(80, windowDrag.current.startY + event.clientY - windowDrag.current.y)) }) }} onPointerUp={() => { windowDrag.current = null }} onPointerCancel={() => { windowDrag.current = null }}><div>{app && <app.icon size={17} />}<strong>{app?.label}</strong><span>GUARDIAN</span></div><div><button aria-label="창 최소화" title="최소화" onClick={() => { setActive(null); void refresh() }}><Minimize2 size={16} /></button><button aria-label="창 크기 전환" title="최대화 / 복원" onClick={() => setMaximized(!maximized)}><Maximize2 size={16} /></button><button aria-label="창 닫기" title="닫기" onClick={closeApp}><X size={20} /></button></div></header>
      {opened.filter(id => apps.some(item => item.id === id)).map(id => <iframe hidden={active !== id} key={id} title={`${apps.find(item => item.id === id)?.label} Guardian 화면`} src={`/workspace/?view=${id}&embedded=1`} onLoad={() => { void refresh() }} allow="microphone" />)}
      {localApps.some(item => item.id === active) && <div className="local-window">
        {error && <p role="alert">{error}</p>}
        {active === 'search' && <><Search size={32} /><h2>웹 검색</h2><p>검색어를 Bing으로 전달합니다. 결과는 새 탭에서 열립니다.</p><form onSubmit={event => { event.preventDefault(); setSearchApproval(true) }}><label>검색어<input value={search} onChange={event => setSearch(event.target.value)} required maxLength={500} /></label><button className="accent-button" disabled={!search.trim()}><Search size={18} />검색 내용 확인</button></form></>}
        {active === 'files' && <><FolderOpen size={32} /><h2>내가 선택한 파일</h2><p>선택한 텍스트 파일만 이 브라우저에서 읽습니다. 서버로 업로드하지 않습니다.</p><label className="file-picker">파일 선택<input type="file" accept=".txt,.md,.csv,.json" onChange={async event => { const selected = event.target.files?.[0]; if (!selected) return; if (selected.size > 1024 * 1024) { setError('파일은 1MB 이하로 선택하세요.'); return } const revision = generation.current; const content = await selected.text(); if (revision === generation.current) setFile({ name: selected.name, content }) }} /></label>{file && <><div className="file-info"><strong>{file.name}</strong><button onClick={() => setFile(null)} aria-label="선택한 파일 지우기"><X size={17} /></button></div><pre>{file.content}</pre></>}</>}
        {active === 'device' && <><Monitor size={32} /><h2>화면과 접근성</h2><p>이 인터페이스에만 적용됩니다. Windows 볼륨·네트워크·파일 권한은 변경하지 않습니다.</p><label className="toggle-row"><span>큰 글씨</span><input type="checkbox" checked={large} onChange={event => setLarge(event.target.checked)} /></label><label className="toggle-row"><span>움직임 줄이기</span><input type="checkbox" checked={reduced} onChange={event => setReduced(event.target.checked)} /></label><label className="toggle-row"><span>답변 자동 읽기</span><input type="checkbox" checked={sound} onChange={event => { setSound(event.target.checked); speechSynthesis.cancel(); setMode('idle') }} /></label><button className="accent-button" onClick={() => { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => setError('전체 화면을 사용할 수 없습니다.')); else void document.exitFullscreen() }}><Maximize2 size={18} />전체 화면 전환</button><button className="secondary-button" onClick={lock}><LockKeyhole size={18} />화면 가리기</button><p>화면 가리기는 사용자 인증이나 OS 잠금이 아닙니다.</p></>}
      </div>}
    </section>}
    {voiceConsent && <dialog ref={voiceDialog} className="os-dialog" aria-label="음성 전송 동의" onCancel={() => setVoiceConsent(false)} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setVoiceConsent(false) } }}><Mic size={27} /><h2>음성 입력을 시작할까요?</h2><p>음성이 브라우저의 음성 서비스로 전송될 수 있습니다. 인식된 문장은 입력창에 표시되며 자동 실행하지 않습니다.</p><div><button onClick={() => setVoiceConsent(false)}>취소</button><button className="accent-button" onClick={startVoice}>동의하고 시작</button></div></dialog>}
    {searchApproval && <dialog ref={dialog} className="os-dialog" aria-label="검색 전송 확인" onCancel={() => setSearchApproval(false)} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setSearchApproval(false) } }}><Search size={27} /><h2>외부 검색을 열까요?</h2><p>{search}</p><small>전송 대상: www.bing.com · 성인 프로필과 검색 허용 정책이 필요합니다. 검색 결과의 안전을 보증하지 않습니다.</small><div><button disabled={searchBusy} onClick={() => setSearchApproval(false)}>취소</button><button disabled={searchBusy} className="accent-button" onClick={() => { void openSearch() }}>Bing에서 검색<ArrowRight size={16} /></button></div></dialog>}
  </main>
}