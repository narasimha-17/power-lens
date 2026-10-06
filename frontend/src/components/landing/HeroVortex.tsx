import { useEffect, useRef } from 'react'
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three'

type Rgb = [number, number, number]

const TAU = Math.PI * 2
/** Inner rim -> outer edge, the brand gradient from the hero reference. */
const GRADIENT: Rgb[] = [
  [34, 211, 238],
  [56, 135, 250],
  [96, 92, 240],
  [146, 86, 244],
  [200, 104, 236],
]

function gradientAt(t: number): Rgb {
  const x = Math.min(0.999, Math.max(0, t)) * (GRADIENT.length - 1)
  const i = Math.floor(x)
  const f = x - i
  const a = GRADIENT[i]
  const b = GRADIENT[i + 1]
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}

const srgb = (c: Rgb, k = 1) =>
  new Color().setRGB(Math.min(1, (c[0] / 255) * k), Math.min(1, (c[1] / 255) * k), Math.min(1, (c[2] / 255) * k), SRGBColorSpace)

const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

interface RingSpec {
  inner: number
  outer: number
  blades: number
  swirl: number
  spin: number // radians per second
  particles: number
}

/** A swirling ring of overlapping curved blades, a glowing rim and a cloud of cube particles
 * shedding off its outer edge. */
function buildRing(spec: RingSpec, disposables: { dispose(): void }[]) {
  const track = <T extends { dispose(): void }>(d: T): T => {
    disposables.push(d)
    return d
  }
  const group = new Group()
  const { inner, outer, blades, swirl } = spec
  const steps = 16
  const bladeWidth = (TAU / blades) * 2.7

  // Blades: each is a strip that sweeps from the inner rim to the outer edge along a spiral,
  // domed slightly toward its middle and stacked a hair higher than the previous one so the
  // blades overlap like petals.
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const edgeLines: number[] = []
  for (let b = 0; b < blades; b++) {
    const phase = (b / blades) * TAU
    const tone = 0.9 + 0.2 * (b % 2)
    const base = positions.length / 3
    let prev: [number, number, number] | null = null
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const r = inner + (outer - inner) * t
      const theta = phase + swirl * t
      const z = b * 0.0016 + 0.07 * outer * Math.sin(Math.PI * Math.pow(t, 0.85))
      const half = bladeWidth * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.1))) * 0.5 + 0.02
      const [cr, cg, cb] = gradientAt(t)
      for (const [side, shade] of [
        [-1, 1.14],
        [1, 0.8],
      ] as const) {
        const a = theta + side * half
        positions.push(Math.cos(a) * r, Math.sin(a) * r, z)
        colors.push(
          ...srgb([cr, cg, cb], tone * shade).toArray(),
        )
      }
      const center: [number, number, number] = [Math.cos(theta) * r, Math.sin(theta) * r, z + 0.003]
      if (prev) edgeLines.push(...prev, ...center)
      prev = center
      if (s < steps) {
        const i = base + s * 2
        indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2)
      }
    }
  }
  const bladeGeometry = track(new BufferGeometry())
  bladeGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  bladeGeometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  bladeGeometry.setIndex(indices)
  group.add(
    new Mesh(bladeGeometry, track(new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, toneMapped: false }))),
  )

  const lineGeometry = track(new BufferGeometry())
  lineGeometry.setAttribute('position', new Float32BufferAttribute(edgeLines, 3))
  group.add(
    new LineSegments(
      lineGeometry,
      track(new LineBasicMaterial({ color: 0xdfe6ff, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false })),
    ),
  )

  // Glow: a bright cyan rim just inside the hole, and a soft magenta halo past the outer edge.
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const g = canvas.getContext('2d')!
  const reach = outer * 1.5
  const p = (r: number) => Math.min(1, Math.max(0, r / reach))
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  const span = outer - inner
  grad.addColorStop(p(inner - 0.03), 'rgba(34,211,238,0)')
  grad.addColorStop(p(inner), 'rgba(34,211,238,0.42)')
  grad.addColorStop(p(inner + span * 0.28), 'rgba(59,150,255,0.14)')
  grad.addColorStop(p(inner + span * 0.6), 'rgba(110,100,246,0)')
  grad.addColorStop(p(outer * 0.95), 'rgba(226,110,235,0)')
  grad.addColorStop(p(outer), 'rgba(200,104,236,0.16)')
  grad.addColorStop(p(outer * 1.3), 'rgba(226,110,235,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  const glowTexture = track(new CanvasTexture(canvas))
  glowTexture.colorSpace = SRGBColorSpace
  const glow = new Mesh(
    track(new PlaneGeometry(reach * 2, reach * 2)),
    track(
      new MeshBasicMaterial({
        map: glowTexture,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    ),
  )
  glow.position.z = 0.09 * outer + 0.02
  group.add(glow)

  // Particles: tiny tumbling cubes, mostly clustered around the outer edge, some drifting
  // through the blades, a few bright cyan sparks.
  const cube = track(new BoxGeometry(1, 1, 1))
  const cubes = new InstancedMesh(cube, track(new MeshBasicMaterial({ toneMapped: false })), spec.particles)
  const particle = Array.from({ length: spec.particles }, (_, i) => {
    const edge = rand(i + 1) < 0.72
    const radius = edge
      ? outer * (0.88 + Math.pow(rand(i + 2), 1.8) * 0.5)
      : inner + (outer - inner) * rand(i + 3)
    const t = (radius - inner) / (outer - inner)
    const spark = rand(i + 4) < 0.22
    cubes.setColorAt(i, srgb(spark ? [120, 235, 255] : gradientAt(t + (rand(i + 5) - 0.5) * 0.25), 0.8 + rand(i + 6) * 0.5))
    return {
      radius,
      angle: rand(i + 7) * TAU,
      speed: (0.05 + rand(i + 8) * 0.16) * (rand(i + 9) < 0.5 ? 1 : -1),
      z: (rand(i + 10) - 0.5) * 0.3 * outer,
      size: (0.006 + Math.pow(rand(i + 11), 3) * 0.034) * outer * (spark ? 0.8 : 1),
      drift: 0.02 + rand(i + 12) * 0.06,
      rate: 0.4 + rand(i + 13) * 1.2,
      phase: rand(i + 14) * TAU,
      tumble: [rand(i + 15) * 2 - 1, rand(i + 16) * 2 - 1, rand(i + 17) * 2 - 1],
    }
  })
  if (cubes.instanceColor) cubes.instanceColor.needsUpdate = true
  group.add(cubes)

  const dummy = new Object3D()
  const update = (time: number, dt: number) => {
    group.rotation.z += dt * spec.spin
    const sec = time / 1000
    for (let i = 0; i < particle.length; i++) {
      const q = particle[i]
      const r = q.radius + Math.sin(sec * q.rate + q.phase) * q.drift
      const a = q.angle + sec * q.speed
      dummy.position.set(Math.cos(a) * r, Math.sin(a) * r, q.z)
      dummy.rotation.set(sec * q.tumble[0] * 1.5, sec * q.tumble[1] * 1.5, sec * q.tumble[2] * 1.5)
      dummy.scale.setScalar(q.size * (0.75 + 0.25 * Math.sin(sec * q.rate * 2 + q.phase)))
      dummy.updateMatrix()
      cubes.setMatrixAt(i, dummy.matrix)
    }
    cubes.instanceMatrix.needsUpdate = true
  }
  update(0, 0)
  return { group, update }
}

/** The hero artwork: two interlocking swirl-bladed vortex rings shedding glittering particles.
 * They counter-rotate, breathe, and lean toward the pointer; with reduced motion they hold
 * still. */
export default function HeroVortex() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
    } catch {
      return // No WebGL: the soft glow behind the canvas still gives the hero some depth.
    }
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const disposables: { dispose(): void }[] = []
    const scene = new Scene()
    const camera = new PerspectiveCamera(30, 1, 0.1, 100)
    camera.position.set(0, 0, 7.6)

    const big = buildRing({ inner: 0.42, outer: 1, blades: 58, swirl: 1.25, spin: 0.16, particles: 1500 }, disposables)
    const small = buildRing({ inner: 0.27, outer: 0.62, blades: 46, swirl: 1.2, spin: -0.24, particles: 900 }, disposables)
    const bigPivot = new Group()
    const smallPivot = new Group()
    bigPivot.add(big.group)
    smallPivot.add(small.group)
    bigPivot.position.set(-0.5, 0.42, 0)
    smallPivot.position.set(0.98, -0.78, 0)
    const root = new Group()
    root.add(bigPivot, smallPivot)
    root.position.x = -0.02
    scene.add(root)

    let visible = true
    let raf = 0
    let last = 0
    let target = { x: 0, y: 0 }
    let current = { x: 0, y: 0 }

    function resize() {
      const rect = canvas!.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      renderer.setSize(rect.width, rect.height, false)
      camera.aspect = rect.width / rect.height
      camera.updateProjectionMatrix()
    }
    function render(time: number) {
      const dt = last ? Math.min(0.05, (time - last) / 1000) : 0
      last = time
      if (!reduceMotion) {
        current = { x: current.x + (target.x - current.x) * 0.05, y: current.y + (target.y - current.y) * 0.05 }
        const sec = time / 1000
        bigPivot.rotation.x = 0.3 + Math.sin(sec * 0.6) * 0.09 + current.y * 0.18
        bigPivot.rotation.y = -0.24 + Math.cos(sec * 0.5) * 0.09 + current.x * 0.2
        smallPivot.rotation.x = -0.26 + Math.cos(sec * 0.55) * 0.1 - current.y * 0.22
        smallPivot.rotation.y = 0.3 + Math.sin(sec * 0.45) * 0.1 - current.x * 0.25
        bigPivot.scale.setScalar(1 + Math.sin(sec * 0.9) * 0.012)
        smallPivot.scale.setScalar(1 + Math.sin(sec * 0.9 + 1.5) * 0.016)
        big.update(time, dt)
        small.update(time, dt)
      }
      renderer.render(scene, camera)
    }
    function frame(time: number) {
      raf = requestAnimationFrame(frame)
      if (visible) render(time)
    }
    const onPointer = (e: PointerEvent) => {
      target = { x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 }
    }

    bigPivot.rotation.set(0.3, -0.24, 0)
    smallPivot.rotation.set(-0.26, 0.3, 0)
    resize()
    render(0)
    const ro = new ResizeObserver(() => {
      resize()
      render(last)
    })
    ro.observe(canvas)
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
    })
    io.observe(canvas)
    if (!reduceMotion) {
      window.addEventListener('pointermove', onPointer, { passive: true })
      raf = requestAnimationFrame(frame)
    }

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      window.removeEventListener('pointermove', onPointer)
      disposables.forEach((d) => d.dispose())
      renderer.dispose()
    }
  }, [])

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[760px]">
      <div
        aria-hidden
        className="absolute inset-[8%] rounded-full bg-gradient-to-tr from-cyan-500/15 via-violet-600/30 to-fuchsia-500/25 blur-[80px]"
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
    </div>
  )
}
