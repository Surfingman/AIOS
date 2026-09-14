import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking'

export default function OrbScene({ state, reduced }: { state: OrbState; reduced: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const mode = useRef(state)
  const motion = useRef(reduced)
  const [failed, setFailed] = useState(false)
  useEffect(() => { mode.current = state }, [state])
  useEffect(() => { motion.current = reduced }, [reduced])
  useEffect(() => {
    if (!host.current) return
    const container = host.current
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true }) }
    catch { setFailed(true); return }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)
    renderer.domElement.setAttribute('aria-label', '상태에 반응하는 3D AI 캐릭터')
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50)
    camera.position.set(0, 0, 6.8)
    scene.add(new THREE.AmbientLight(0xdde9ff, 2))
    const light = new THREE.DirectionalLight(0xffffff, 5)
    light.position.set(-3, 4, 5); scene.add(light)
    const rim = new THREE.PointLight(0x49e5cf, 28)
    rim.position.set(3, -1, 2); scene.add(rim)
    const character = new THREE.Group(); scene.add(character)
    const material = new THREE.MeshPhysicalMaterial({ color: '#658dcb', metalness: 0.24, roughness: 0.24, clearcoat: 1, emissive: '#183f6b', emissiveIntensity: 0.5 })
    character.add(new THREE.Mesh(new THREE.SphereGeometry(1.02, 64, 48), material))
    const white = new THREE.MeshBasicMaterial({ color: '#f6fbff' })
    const dark = new THREE.MeshBasicMaterial({ color: '#17233c' })
    const eyes: THREE.Group[] = []
    for (const direction of [-1, 1]) {
      const eye = new THREE.Group(); eye.position.set(direction * 0.3, 0.19, 0.94)
      const outer = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), white); outer.scale.set(0.92, 1.35, 0.4); eye.add(outer)
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.062, 16, 12), dark); pupil.position.set(0.009, -0.004, 0.051); pupil.scale.z = 0.4; eye.add(pupil)
      eyes.push(eye); character.add(eye)
    }
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.022, 12, 40, Math.PI), white)
    mouth.rotation.z = Math.PI; mouth.position.set(0, -0.2, 0.98); character.add(mouth)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.29, 0.007, 8, 180), new THREE.MeshBasicMaterial({ color: '#7bbaff', transparent: true, opacity: 0.7 }))
    scene.add(ring)
    const second = ring.clone(); second.scale.setScalar(1.05); second.rotation.x = 0.25; scene.add(second)
    const resize = () => { const { width, height } = container.getBoundingClientRect(); if (width < 1 || height < 1) return; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix() }
    const observer = new ResizeObserver(resize); observer.observe(container); resize()
    window.addEventListener('resize', resize)
    const started = performance.now()
    const colors = { idle: '#658dcb', listening: '#3cae98', thinking: '#be9860', speaking: '#7c87d6' }
    const targetColor = new THREE.Color()
    renderer.setAnimationLoop(() => {
      const elapsed = (performance.now() - started) / 1000
      const activeTime = motion.current ? 0 : elapsed
      character.position.y = Math.sin(activeTime * 1.3) * 0.07
      character.rotation.y = Math.sin(activeTime * 0.5) * 0.13
      character.scale.setScalar(1 + (mode.current === 'listening' ? Math.sin(activeTime * 5) * 0.025 : 0))
      targetColor.set(colors[mode.current]); material.color.lerp(targetColor, 0.08)
      const blink = !motion.current && Math.sin(elapsed * 0.9) > 0.994 ? 0.12 : mode.current === 'thinking' ? 0.6 : 1
      eyes.forEach(eye => { eye.scale.y = blink })
      mouth.scale.y = mode.current === 'speaking' ? 0.5 + Math.abs(Math.sin(activeTime * 8)) : 1
      ring.rotation.y = Math.sin(activeTime * 0.4) * 0.2
      second.rotation.z = activeTime * (mode.current === 'thinking' ? 0.7 : 0.08)
      renderer.render(scene, camera)
    })
    return () => {
      observer.disconnect(); window.removeEventListener('resize', resize); renderer.setAnimationLoop(null)
      const materials = new Set<THREE.Material>(); const geometries = new Set<THREE.BufferGeometry>()
      scene.traverse(object => { if (object instanceof THREE.Mesh) { geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(item => materials.add(item)) } })
      materials.forEach(item => item.dispose()); geometries.forEach(item => item.dispose()); renderer.dispose(); renderer.domElement.remove()
    }
  }, [])
  return <div className="orb-renderer" ref={host}>{failed && <div className="orb-unavailable">3D 표시를 사용할 수 없습니다. 기능 메뉴는 계속 사용할 수 있습니다.</div>}</div>
}