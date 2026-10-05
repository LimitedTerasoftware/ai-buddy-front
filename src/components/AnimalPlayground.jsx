import { useEffect, useRef, useState } from 'react'
import { RotateCcw, Volume2, VolumeX, Square } from 'lucide-react'
import * as THREE from 'three'
import { ANIMAL_CHARACTERS } from './animalCharacters'
import { createAnimalModel, disposeAnimalModel, playAnimalSound } from './animalEngine'
import './AnimalPlayground.css'

export default function AnimalPlayground({ appearance, onSelect }) {
  const hostRef = useRef(null)
  const modelRef = useRef(null)
  const sceneRef = useRef(null)
  const motionStartRef = useRef(-Infinity)
  const motionRequestedRef = useRef(false)
  const audioContextRef = useRef(null)
  const stopAudioRef = useRef(null)
  const soundRequestRef = useRef(0)
  const timeoutRef = useRef(null)
  const [muted, setMuted] = useState(false)
  const [moving, setMoving] = useState(false)
  const [error, setError] = useState('')
  const [canvasError, setCanvasError] = useState(false)
  const animal = ANIMAL_CHARACTERS.find(item => item.id === appearance) || ANIMAL_CHARACTERS[0]

  useEffect(() => {
    const host = hostRef.current
    let renderer
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }) }
    catch {
      let mounted = true
      queueMicrotask(() => { if (mounted) setCanvasError(true) })
      return () => { mounted = false }
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor('#f5f8ff', 0)
    host.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    sceneRef.current = scene
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50)
    camera.position.set(0, 0.15, 9)
    camera.lookAt(0, 0.15, 0)
    scene.add(new THREE.HemisphereLight('#ffffff', '#b1c8dc', 2.5))
    const light = new THREE.DirectionalLight('#fff2d5', 3)
    light.position.set(-3, 5, 6)
    scene.add(light)
    const resize = () => {
      const { width, height } = host.getBoundingClientRect()
      renderer.setSize(width, height, false)
      camera.aspect = width / Math.max(height, 1)
      camera.position.z = camera.aspect < 1 ? 9 / camera.aspect : 9
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame
    const render = now => {
      if (motionRequestedRef.current) { motionStartRef.current = now; motionRequestedRef.current = false }
      const model = modelRef.current
      if (model) {
        const elapsed = (now - motionStartRef.current) / 1000
        const active = elapsed >= 0 && elapsed < 2.6 && !reducedMotion.matches
        if (active) {
          const progress = elapsed / 2.6
          const envelope = Math.sin(progress * Math.PI)
          model.position.y = Math.cos(progress * Math.PI * 4) * 0.65 * envelope
          model.rotation.y = Math.sin(progress * Math.PI * 4) * 0.65 * envelope
          model.rotation.z = Math.sin(progress * Math.PI * 2) * 0.12 * envelope
        } else {
          model.position.y = 0
          model.rotation.set(0, 0, 0)
        }
      }
      renderer.render(scene, camera)
      frame = requestAnimationFrame(render)
    }
    frame = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      if (modelRef.current) disposeAnimalModel(modelRef.current)
      modelRef.current = null
      sceneRef.current = null
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    if (modelRef.current) { scene.remove(modelRef.current); disposeAnimalModel(modelRef.current) }
    const model = createAnimalModel(appearance)
    modelRef.current = model
    scene.add(model)
  }, [appearance])

  useEffect(() => () => {
    soundRequestRef.current++
    clearTimeout(timeoutRef.current)
    stopAudioRef.current?.()
    audioContextRef.current?.close().catch(() => {})
  }, [])

  const stop = () => {
    soundRequestRef.current++
    stopAudioRef.current?.()
    stopAudioRef.current = null
    motionStartRef.current = -Infinity
    motionRequestedRef.current = false
    clearTimeout(timeoutRef.current)
    setMoving(false)
  }

  const activate = async id => {
    stop()
    onSelect(id)
    setError('')
    motionRequestedRef.current = true
    setMoving(true)
    timeoutRef.current = setTimeout(() => setMoving(false), 2600)
    if (muted) return
    const request = ++soundRequestRef.current
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) throw new Error('Audio is unavailable')
      audioContextRef.current ||= new AudioContext()
      await audioContextRef.current.resume()
      if (request !== soundRequestRef.current) return
      stopAudioRef.current = playAnimalSound(audioContextRef.current, id)
    } catch { if (request === soundRequestRef.current) setError('Sound is unavailable in this browser.') }
  }

  return <div className="animal-playground">
    <div className="animal-picker" role="group" aria-label="Animal characters">
      {ANIMAL_CHARACTERS.map(item => <button type="button" key={item.id} aria-pressed={appearance === item.id} onClick={() => activate(item.id)} className={appearance === item.id ? 'selected' : ''}>
        <span className="animal-picker-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>
      </button>)}
    </div>
    <div className="animal-scene" ref={hostRef} role="img" aria-label={`${animal.label} 3D character${moving ? ', moving up and down' : ''}`}>
      {canvasError && <span className="animal-fallback" aria-hidden="true">{animal.icon}</span>}
    </div>
    <div className="animal-preview-footer">
      <div><strong>{animal.label}</strong><span>{animal.call}</span></div>
      <div className="animal-preview-tools">
        <button type="button" aria-label={`Replay ${animal.label}`} title="Replay" onClick={() => activate(appearance)}><RotateCcw size={20} /></button>
        <button type="button" aria-label="Stop sound and motion" title="Stop" disabled={!moving} onClick={stop}><Square size={18} /></button>
        <button type="button" aria-label={muted ? 'Unmute animal sounds' : 'Mute animal sounds'} aria-pressed={muted} title={muted ? 'Unmute' : 'Mute'} onClick={() => { stop(); setMuted(!muted) }}>{muted ? <VolumeX size={20} /> : <Volume2 size={20} />}</button>
      </div>
    </div>
    {error && <p role="status" className="animal-audio-error">{error}</p>}
  </div>
}
