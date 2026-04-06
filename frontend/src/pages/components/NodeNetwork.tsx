import { useEffect, useRef } from 'react'

interface NodeNetworkProps {
  className?: string
  nodeCount?: number
}

interface Node {
  x: number
  y: number
  vx: number
  vy: number
}

interface Packet {
  fromIdx: number
  toIdx: number
  t: number
  speed: number
}

const EDGE_DIST = 130
const REPULSION_RADIUS = 90
const PADDING = 20

export function NodeNetwork({ className, nodeCount = 40 }: NodeNetworkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })
  const nodesRef = useRef<Node[]>([])
  const packetsRef = useRef<Packet[]>([])
  const frameRef = useRef<number>(0)
  const lastPacketTimeRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const initNodes = () => {
      nodesRef.current = Array.from({ length: nodeCount }, () => {
        const angle = Math.random() * Math.PI * 2
        const speed = 0.08 + Math.random() * 0.12
        return {
          x: PADDING + Math.random() * (canvas.width - PADDING * 2),
          y: PADDING + Math.random() * (canvas.height - PADDING * 2),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
        }
      })
      packetsRef.current = []
    }

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      initNodes()
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    window.addEventListener('mousemove', handleMouseMove, { passive: true })

    const isDark = () => document.documentElement.classList.contains('dark')

    const animate = (time: number) => {
      if (!canvas.isConnected) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const dark = isDark()
      const rgb = dark ? '255,255,255' : '0,0,0'
      const opacityMul = dark ? 1 : 1.6
      const nodes = nodesRef.current
      const mx = mouseRef.current.x
      const my = mouseRef.current.y

      // Update node positions
      for (const n of nodes) {
        n.x += n.vx
        n.y += n.vy
        if (n.x < PADDING) { n.x = PADDING; n.vx = Math.abs(n.vx) }
        if (n.x > canvas.width - PADDING) { n.x = canvas.width - PADDING; n.vx = -Math.abs(n.vx) }
        if (n.y < PADDING) { n.y = PADDING; n.vy = Math.abs(n.vy) }
        if (n.y > canvas.height - PADDING) { n.y = canvas.height - PADDING; n.vy = -Math.abs(n.vy) }

        // Mouse repulsion
        const dx = n.x - mx
        const dy = n.y - my
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < REPULSION_RADIUS && dist > 0) {
          const force = (1 - dist / REPULSION_RADIUS) * 1.8
          n.x += (dx / dist) * force
          n.y += (dy / dist) * force
        }
      }

      // Draw edges
      ctx.lineWidth = 0.5
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < EDGE_DIST) {
            const a = (1 - dist / EDGE_DIST) * 0.18 * opacityMul
            ctx.beginPath()
            ctx.strokeStyle = `rgba(${rgb},${a.toFixed(3)})`
            ctx.moveTo(nodes[i].x, nodes[i].y)
            ctx.lineTo(nodes[j].x, nodes[j].y)
            ctx.stroke()
          }
        }
      }

      // Draw nodes
      for (const n of nodes) {
        ctx.beginPath()
        ctx.arc(n.x, n.y, 1.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${rgb},${(0.22 * opacityMul).toFixed(2)})`
        ctx.fill()
      }

      // Spawn packets periodically
      if (time - lastPacketTimeRef.current > 2200) {
        lastPacketTimeRef.current = time
        const pairs: [number, number][] = []
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const dx = nodes[i].x - nodes[j].x
            const dy = nodes[i].y - nodes[j].y
            if (dx * dx + dy * dy < EDGE_DIST * EDGE_DIST) pairs.push([i, j])
          }
        }
        if (pairs.length > 0) {
          const [fi, ti] = pairs[Math.floor(Math.random() * pairs.length)]
          packetsRef.current.push({ fromIdx: fi, toIdx: ti, t: 0, speed: 0.007 + Math.random() * 0.006 })
        }
      }

      // Draw packets
      packetsRef.current = packetsRef.current.filter(p => p.t <= 1)
      for (const pkt of packetsRef.current) {
        pkt.t += pkt.speed
        const from = nodes[pkt.fromIdx]
        const to = nodes[pkt.toIdx]
        const px = from.x + (to.x - from.x) * pkt.t
        const py = from.y + (to.y - from.y) * pkt.t
        // Glow
        ctx.beginPath()
        ctx.arc(px, py, 4.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${rgb},${(0.12 * opacityMul).toFixed(2)})`
        ctx.fill()
        // Core
        ctx.beginPath()
        ctx.arc(px, py, 2, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${rgb},${(0.65 * opacityMul).toFixed(2)})`
        ctx.fill()
      }

      frameRef.current = requestAnimationFrame(animate)
    }

    frameRef.current = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(frameRef.current)
      ro.disconnect()
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [nodeCount])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  )
}
