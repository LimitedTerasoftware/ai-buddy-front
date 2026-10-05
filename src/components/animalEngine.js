import * as THREE from 'three'

import { ANIMAL_CHARACTERS } from './animalCharacters'

export function createAnimalModel(id) {
  const animal = ANIMAL_CHARACTERS.find(item => item.id === id) || ANIMAL_CHARACTERS[0]
  const root = new THREE.Group()
  const sphere = (color, position, scale) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), new THREE.MeshStandardMaterial({ color, roughness: 0.65 }))
    mesh.position.set(...position)
    mesh.scale.set(...scale)
    root.add(mesh)
    return mesh
  }
  const ear = (x, y, sx, sy, color = animal.color) => sphere(color, [x, y, 0], [sx, sy, 0.24])
  if (id === 'lion') {
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6
      sphere('#b96632', [Math.cos(angle) * 0.94, Math.sin(angle) * 0.94, -0.25], [0.45, 0.45, 0.36])
    }
  }
  if (id === 'peacock') {
    for (let i = 0; i < 9; i++) {
      const angle = Math.PI * (0.08 + i * 0.105)
      const feather = sphere(i % 2 ? '#3daf8c' : '#2b9071', [Math.cos(angle) * 1.3, Math.sin(angle) * 1.3 - 0.1, -0.5], [0.27, 0.8, 0.12])
      feather.rotation.z = angle - Math.PI / 2
      sphere('#e5bd53', [Math.cos(angle) * 1.6, Math.sin(angle) * 1.6 - 0.1, -0.34], [0.16, 0.2, 0.06])
      sphere('#2376a1', [Math.cos(angle) * 1.6, Math.sin(angle) * 1.6 - 0.1, -0.26], [0.09, 0.12, 0.04])
    }
  }
  if (id === 'elephant') {
    ear(-1, 0.12, 0.65, 0.87)
    ear(1, 0.12, 0.65, 0.87)
    ear(-1, 0.12, 0.43, 0.62, '#c5b2c8')
    ear(1, 0.12, 0.43, 0.62, '#c5b2c8')
  } else if (id === 'rabbit') {
    ear(-0.43, 1.15, 0.26, 0.94)
    ear(0.43, 1.15, 0.26, 0.94)
    const left = ear(-0.43, 1.18, 0.13, 0.71, '#eca5b9')
    const right = ear(0.43, 1.18, 0.13, 0.71, '#eca5b9')
    left.position.z = right.position.z = 0.19
  } else if (id === 'puppy') {
    const left = ear(-0.87, 0.03, 0.34, 0.7, '#905b40')
    const right = ear(0.87, 0.03, 0.34, 0.7, '#905b40')
    left.rotation.z = -0.2
    right.rotation.z = 0.2
  } else if (['kitten', 'tiger'].includes(id)) {
    for (const x of [-0.64, 0.64]) {
      const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.75, 3), new THREE.MeshStandardMaterial({ color: animal.color, roughness: 0.6 }))
      mesh.position.set(x, 0.86, 0)
      mesh.rotation.y = Math.PI / 2
      root.add(mesh)
      sphere('#f2becb', [x, 0.92, 0.16], [0.14, 0.24, 0.06])
    }
  }
  sphere(animal.color, [0, 0, 0], [0.88, 0.88, 0.68])
  if (id === 'tiger') {
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const stripe = sphere('#59412c', [side * (0.69 - i * 0.035), 0.32 - i * 0.25, 0.46], [0.19, 0.045, 0.045])
        stripe.rotation.z = side * 0.35
      }
    }
    sphere('#59412c', [0, 0.67, 0.44], [0.065, 0.19, 0.035])
  }
  if (id === 'robot') {
    sphere('#204d49', [0, 0.12, 0.58], [0.66, 0.35, 0.16])
    ear(-0.95, 0.1, 0.17, 0.28, '#419f8a')
    ear(0.95, 0.1, 0.17, 0.28, '#419f8a')
    sphere('#ffbe5e', [0, 1.02, 0], [0.14, 0.14, 0.14])
  }
  for (const x of [-0.3, 0.3]) {
    sphere(id === 'robot' ? '#bcffe5' : '#26303c', [x, 0.15, 0.64], [0.1, 0.14, 0.065])
    sphere('#ffffff', [x - 0.025, 0.2, 0.696], [0.027, 0.036, 0.016])
  }
  if (['parrot', 'peacock'].includes(id)) {
    sphere('#f4bc58', [0, -0.13, 0.76], [0.2, 0.32, 0.24])
    for (let i = -1; i <= 1; i++) ear(i * 0.18, 0.88 + Math.abs(i) * 0.04, 0.08, 0.3, id === 'parrot' ? '#ee705b' : '#2376a1')
  } else if (id === 'elephant') {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.2, 0.7), new THREE.Vector3(0, -0.65, 0.88), new THREE.Vector3(0.16, -1.2, 0.9), new THREE.Vector3(0.42, -1.1, 0.88)])
    root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.17, 12, false), new THREE.MeshStandardMaterial({ color: animal.color, roughness: 0.6 })))
  } else if (id !== 'robot') {
    sphere('#fff2df', [-0.18, -0.25, 0.59], [0.32, 0.26, 0.15])
    sphere('#fff2df', [0.18, -0.25, 0.59], [0.32, 0.26, 0.15])
    sphere(id === 'rabbit' || id === 'kitten' ? '#c06b8b' : '#26303c', [0, -0.16, 0.79], [0.12, 0.085, 0.06])
  }
  return root
}

export function disposeAnimalModel(model) {
  model.traverse(object => {
    object.geometry?.dispose()
    if (object.material) object.material.dispose()
  })
}

// Short synthesized calls keep the playground offline and avoid harsh recordings.
export function playAnimalSound(context, id) {
  const bus = context.createGain()
  bus.gain.value = 0.22
  bus.connect(context.destination)
  const nodes = []
  const now = context.currentTime + 0.03
  const tone = (offset, duration, from, to, type = 'sine', volume = 0.5, noise = false) => {
    const envelope = context.createGain()
    envelope.connect(bus)
    const start = now + offset
    envelope.gain.setValueAtTime(0.001, start)
    envelope.gain.exponentialRampToValueAtTime(volume, start + 0.03)
    envelope.gain.exponentialRampToValueAtTime(0.001, start + duration)
    let source
    if (noise) {
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      source = context.createBufferSource()
      source.buffer = buffer
      const filter = context.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(from, start)
      filter.frequency.exponentialRampToValueAtTime(to, start + duration)
      source.connect(filter)
      filter.connect(envelope)
      nodes.push(filter)
    } else {
      source = context.createOscillator()
      source.type = type
      source.frequency.setValueAtTime(from, start)
      source.frequency.exponentialRampToValueAtTime(to, start + duration)
      source.connect(envelope)
    }
    source.start(start)
    source.stop(start + duration)
    nodes.push(source, envelope)
  }
  if (id === 'puppy') { tone(0, 0.25, 230, 95, 'sawtooth'); tone(0.4, 0.3, 210, 80, 'sawtooth') }
  else if (id === 'kitten') { tone(0, 0.8, 740, 280, 'triangle'); tone(0.08, 0.7, 930, 420, 'sine', 0.15) }
  else if (id === 'lion' || id === 'tiger') {
    tone(0, 1.4, id === 'lion' ? 120 : 180, 50, 'sawtooth', 0.35)
    tone(0, 1.4, 950, 170, 'sine', 0.35, true)
  } else if (id === 'rabbit') { tone(0, 0.22, 130, 40); tone(0.35, 0.22, 130, 40) }
  else if (id === 'elephant') { tone(0, 0.35, 280, 620, 'sawtooth', 0.3); tone(0.3, 0.8, 620, 180, 'sawtooth', 0.3) }
  else if (id === 'peacock') { tone(0, 0.5, 850, 1400, 'triangle'); tone(0.5, 0.7, 1400, 520, 'triangle') }
  else if (id === 'parrot') { for (let i = 0; i < 3; i++) tone(i * 0.26, 0.2, 1550, 700, 'sawtooth', 0.2) }
  else { tone(0, 0.25, 660, 660); tone(0.32, 0.25, 440, 440) }
  return () => {
    bus.disconnect()
    for (const node of nodes) {
      if (typeof node.stop === 'function') { try { node.stop() } catch { /* The scheduled sound may have ended. */ } }
      node.disconnect()
    }
  }
}
