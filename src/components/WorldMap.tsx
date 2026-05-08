import { useEffect, useMemo, useRef, useState } from 'react'
import { geoGraticule10, geoOrthographic, geoPath } from 'd3-geo'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps'
import { feature, mesh } from 'topojson-client'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { bytes, pct, uptime } from '../utils/format'
import { deriveUsage, displayName } from '../utils/derive'
import { cn } from '../utils/cn'
import type { Node } from '../types'
import { nodeKey } from '../utils/nodeKey'

interface Props {
  nodes: Node[]
  onOpen?: (id: string) => void
}

interface NodeGroup {
  key: string
  lat: number
  lng: number
  nodes: Node[]
}

interface GlobeWorldData {
  land: any
  borders: any
}

interface ProjectedMarker extends NodeGroup {
  x: number
  y: number
  depth: number
  onlineCount: number
}

const MAP_W = 900
const MAP_H = 460
const GEO_URL = `${import.meta.env.BASE_URL}world-110m.json`

const GREEN = 'rgb(16 185 129)'
const GRAY = 'rgb(148 163 184)'

const geoBase = {
  fill: 'currentColor',
  fillOpacity: 0.05,
  stroke: 'currentColor',
  strokeOpacity: 0.22,
  strokeWidth: 0.5,
  outline: 'none',
}
const GEO_STYLE = {
  default: geoBase,
  hover: { ...geoBase, fillOpacity: 0.08, strokeOpacity: 0.3 },
  pressed: geoBase,
}

const ptr = { cursor: 'pointer' }
const CURSOR = { default: ptr, hover: ptr, pressed: ptr }

const GLOBE_MIN_SCALE = 145
const GLOBE_MAX_SCALE = 320
const GLOBE_DEFAULT_SCALE = 190
const GLOBE_DEFAULT_ROTATION: [number, number, number] = [-18, -12, 0]

function groupKey(lat: number, lng: number) {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`
}

function groupNodes(nodes: Node[]) {
  const byPos = new Map<string, Node[]>()
  for (const n of nodes) {
    if (n.meta?.lat == null || n.meta?.lng == null) continue
    const k = groupKey(n.meta.lat, n.meta.lng)
    const list = byPos.get(k)
    if (list) list.push(n)
    else byPos.set(k, [n])
  }
  return [...byPos.entries()].map(([key, ns]) => ({
    key,
    lat: ns[0].meta.lat!,
    lng: ns[0].meta.lng!,
    nodes: ns,
  }))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function projectVisibleGroup(group: NodeGroup, rotation: [number, number, number], scale: number): ProjectedMarker | null {
  const projection = geoOrthographic()
    .translate([MAP_W / 2, MAP_H / 2])
    .scale(scale)
    .rotate(rotation)
    .precision(0.1)

  const point = projection([group.lng, group.lat])
  if (!point) return null

  const lambda = (group.lng * Math.PI) / 180
  const phi = (group.lat * Math.PI) / 180
  const centerLon = (-rotation[0] * Math.PI) / 180
  const centerLat = (-rotation[1] * Math.PI) / 180
  const depth = Math.sin(phi) * Math.sin(centerLat) + Math.cos(phi) * Math.cos(centerLat) * Math.cos(lambda - centerLon)
  if (depth <= 0) return null

  return {
    ...group,
    x: point[0],
    y: point[1],
    depth,
    onlineCount: group.nodes.filter(node => node.online).length,
  }
}

export function WorldMap({ nodes, onOpen }: Props) {
  const [mode, setMode] = useState<'2d' | '3d'>('2d')
  const groups = useMemo(() => groupNodes(nodes), [nodes])
  const total = groups.reduce((sum, group) => sum + group.nodes.length, 0)

  return (
    <Card className="p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center rounded-xl border border-border/70 bg-secondary/55 p-1 shadow-sm">
          <button
            type="button"
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-black transition-all duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]',
              mode === '2d' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setMode('2d')}
          >
            2D Map
          </button>
          <button
            type="button"
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-black transition-all duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]',
              mode === '3d' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setMode('3d')}
          >
            3D Map
          </button>
        </div>

        <div className="text-sm font-semibold text-muted-foreground">
          当前显示 <span className="font-black text-foreground">{total}</span> 个节点
        </div>
      </div>

      {mode === '2d' ? (
        <FlatWorldMap groups={groups} total={total} onOpen={onOpen} />
      ) : (
        <Globe3DMap groups={groups} total={total} onOpen={onOpen} />
      )}
    </Card>
  )
}

function FlatWorldMap({ groups, total, onOpen }: { groups: NodeGroup[]; total: number; onOpen?: (id: string) => void }) {
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const closeTimer = useRef<number | null>(null)

  function cancelClose() {
    if (closeTimer.current != null) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  function scheduleClose() {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setHoverKey(null), 140)
  }

  return (
    <div
      className="relative w-full overflow-hidden rounded-md border border-border/60 bg-background/40 text-foreground"
      style={{ aspectRatio: `${MAP_W} / ${MAP_H}` }}
      onClick={() => setHoverKey(null)}
    >
      <ComposableMap
        projection="geoEqualEarth"
        projectionConfig={{ scale: 175 }}
        width={MAP_W}
        height={MAP_H}
        style={{ width: '100%', height: '100%' }}
      >
        <defs>
          <pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeOpacity="0.07" strokeWidth="0.5" />
          </pattern>
          <radialGradient id="map-vignette" cx="50%" cy="50%" r="75%">
            <stop offset="55%" stopColor="hsl(var(--background))" stopOpacity="0" />
            <stop offset="100%" stopColor="hsl(var(--background))" stopOpacity="0.55" />
          </radialGradient>
          <filter id="dot-glow" x="-200%" y="-200%" width="400%" height="400%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x="0" y="0" width={MAP_W} height={MAP_H} fill="url(#map-grid)" />

        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map(geo => (
              <Geography key={geo.rsmKey} geography={geo} style={GEO_STYLE} />
            ))
          }
        </Geographies>

        {groups.map(g => {
          const isCluster = g.nodes.length > 1
          const onlineCount = g.nodes.filter(n => n.online).length
          const color = onlineCount > 0 ? GREEN : GRAY
          const isOpen = hoverKey === g.key

          return (
            <Marker
              key={g.key}
              coordinates={[g.lng, g.lat]}
              onMouseEnter={() => {
                cancelClose()
                setHoverKey(g.key)
              }}
              onMouseLeave={scheduleClose}
              onClick={(e: any) => {
                e.stopPropagation?.()
                if (isCluster) setHoverKey(isOpen ? null : g.key)
                else onOpen?.(nodeKey(g.nodes[0]))
              }}
              style={CURSOR}
            >
              <circle r={20} fill="transparent" />

              <circle
                r={isOpen ? 17 : 11}
                fill="none"
                stroke={color}
                strokeOpacity={isOpen ? 0.42 : 0.32}
                strokeWidth="1.15"
                style={{ transition: 'r 0.25s ease' }}
              />
              <circle
                r={isOpen ? 24 : 15}
                fill="none"
                stroke={color}
                strokeOpacity={isOpen ? 0.18 : 0.08}
                strokeWidth="0.9"
                style={{ transition: 'r 0.25s ease' }}
              />

              {onlineCount > 0 && (
                <circle r={10} fill={color} opacity={0.16}>
                  <animate attributeName="r" values="7;15;7" dur="2.4s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.28;0.02;0.28" dur="2.4s" repeatCount="indefinite" />
                </circle>
              )}

              <circle
                r={isCluster ? 8.5 : isOpen ? 5.2 : 4.2}
                fill={color}
                stroke="white"
                strokeWidth={isCluster ? 1.3 : 1.1}
                filter="url(#dot-glow)"
              />

              {isCluster && (
                <text y={2.6} textAnchor="middle" fontSize={8.4} fontWeight={700} fill="white" style={{ pointerEvents: 'none' }}>
                  {g.nodes.length}
                </text>
              )}

              {isOpen && (
                <MapNodePopoverSvg
                  nodes={g.nodes}
                  lat={g.lat}
                  lng={g.lng}
                  onPick={id => {
                    setHoverKey(null)
                    onOpen?.(id)
                  }}
                  onMouseEnter={cancelClose}
                  onMouseLeave={scheduleClose}
                />
              )}
            </Marker>
          )
        })}

        <rect x="0" y="0" width={MAP_W} height={MAP_H} fill="url(#map-vignette)" pointerEvents="none" />
      </ComposableMap>

      {total === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground pointer-events-none">
          没有节点设置过经纬度
        </div>
      )}
    </div>
  )
}

function Globe3DMap({ groups, total, onOpen }: { groups: NodeGroup[]; total: number; onOpen?: (id: string) => void }) {
  const shellRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [world, setWorld] = useState<GlobeWorldData | null>(null)
  const [scale, setScale] = useState(GLOBE_DEFAULT_SCALE)
  const [rotation, setRotation] = useState<[number, number, number]>(GLOBE_DEFAULT_ROTATION)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const closeTimer = useRef<number | null>(null)
  const dragRef = useRef<{ x: number; y: number; rotation: [number, number, number] } | null>(null)
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null)
  const scaleRef = useRef(GLOBE_DEFAULT_SCALE)
  const rotationRef = useRef<[number, number, number]>(GLOBE_DEFAULT_ROTATION)
  const targetRotationRef = useRef<[number, number, number]>(GLOBE_DEFAULT_ROTATION)
  const hoverKeyRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(GEO_URL)
      .then(res => res.json())
      .then(topology => {
        if (cancelled) return
        const land = feature(topology, topology.objects.land)
        const borders = mesh(topology, topology.objects.countries, (a, b) => a !== b)
        setWorld({ land, borders })
      })
      .catch(() => {
        if (!cancelled) setWorld(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  useEffect(() => {
    rotationRef.current = rotation
  }, [rotation])

  useEffect(() => {
    let frame = 0
    const tick = () => {
      const current = rotationRef.current
      const target = targetRotationRef.current
      const next: [number, number, number] = [
        current[0] + (target[0] - current[0]) * 0.14,
        current[1] + (target[1] - current[1]) * 0.14,
        0,
      ]
      if (Math.abs(next[0] - current[0]) > 0.002 || Math.abs(next[1] - current[1]) > 0.002) {
        rotationRef.current = next
        setRotation(next)
      }
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    hoverKeyRef.current = hoverKey
  }, [hoverKey])

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()
      applyScale(scaleRef.current - event.deltaY * 0.055)
    }
    shell.addEventListener('wheel', onWheel, { passive: false })
    return () => shell.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (dragRef.current || pinchRef.current || hoverKeyRef.current) return
      const current = targetRotationRef.current
      targetRotationRef.current = [current[0] + 0.018, current[1], 0]
    }, 64)
    return () => window.clearInterval(timer)
  }, [])

  const projected = useMemo(() => {
    return groups
      .map(group => projectVisibleGroup(group, rotation, scale))
      .filter((item): item is ProjectedMarker => Boolean(item))
      .sort((a, b) => a.depth - b.depth)
  }, [groups, rotation, scale])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !world) return

    const ratio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    canvas.width = MAP_W * ratio
    canvas.height = MAP_H * ratio
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, MAP_W, MAP_H)

    const projection = geoOrthographic()
      .translate([MAP_W / 2, MAP_H / 2])
      .scale(scale)
      .rotate(rotation)
      .precision(0.1)

    const path = geoPath(projection, context)
    const graticule = geoGraticule10()

    const background = context.createLinearGradient(0, 0, MAP_W, MAP_H)
    background.addColorStop(0, 'rgba(226,232,240,0.12)')
    background.addColorStop(0.5, 'rgba(248,250,252,0.04)')
    background.addColorStop(1, 'rgba(226,232,240,0.12)')
    context.fillStyle = background
    context.fillRect(0, 0, MAP_W, MAP_H)

    context.save()
    context.beginPath()
    path({ type: 'Sphere' } as any)
    context.shadowColor = 'rgba(15,23,42,0.14)'
    context.shadowBlur = 26
    context.shadowOffsetX = 0
    context.shadowOffsetY = 10
    context.fillStyle = 'rgba(148,163,184,0.14)'
    context.fill()
    context.restore()

    context.save()
    context.beginPath()
    path({ type: 'Sphere' } as any)
    context.fillStyle = 'rgba(203,213,225,0.78)'
    context.fill()
    context.strokeStyle = 'rgba(148,163,184,0.34)'
    context.lineWidth = 1.2
    context.stroke()
    context.clip()

    const sphereShade = context.createRadialGradient(MAP_W * 0.38, MAP_H * 0.3, scale * 0.1, MAP_W * 0.56, MAP_H * 0.54, scale * 1.12)
    sphereShade.addColorStop(0, 'rgba(255,255,255,0.3)')
    sphereShade.addColorStop(0.46, 'rgba(255,255,255,0.045)')
    sphereShade.addColorStop(0.84, 'rgba(15,23,42,0.095)')
    sphereShade.addColorStop(1, 'rgba(15,23,42,0.16)')
    context.fillStyle = sphereShade
    context.fillRect(0, 0, MAP_W, MAP_H)

    const rimShade = context.createRadialGradient(MAP_W * 0.5, MAP_H * 0.5, scale * 0.72, MAP_W * 0.5, MAP_H * 0.5, scale * 1.04)
    rimShade.addColorStop(0, 'rgba(255,255,255,0)')
    rimShade.addColorStop(1, 'rgba(15,23,42,0.105)')
    context.fillStyle = rimShade
    context.fillRect(0, 0, MAP_W, MAP_H)

    context.beginPath()
    path(graticule as any)
    context.strokeStyle = 'rgba(148,163,184,0.14)'
    context.lineWidth = 0.7
    context.stroke()

    context.beginPath()
    path(world.land)
    context.fillStyle = 'rgba(100,116,139,0.72)'
    context.fill()

    context.beginPath()
    path(world.borders)
    context.strokeStyle = 'rgba(226,232,240,0.32)'
    context.lineWidth = 0.65
    context.stroke()

    context.restore()

    context.beginPath()
    path({ type: 'Sphere' } as any)
    context.strokeStyle = 'rgba(191,219,254,0.32)'
    context.lineWidth = 1
    context.stroke()
  }, [rotation, scale, world])

  function cancelClose() {
    if (closeTimer.current != null) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  function scheduleClose() {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setHoverKey(null), 180)
  }

  function applyScale(next: number) {
    const value = clamp(next, GLOBE_MIN_SCALE, GLOBE_MAX_SCALE)
    scaleRef.current = value
    setScale(value)
  }

  function onMouseDown(event: React.MouseEvent<HTMLCanvasElement>) {
    const current = rotationRef.current
    targetRotationRef.current = current
    dragRef.current = { x: event.clientX, y: event.clientY, rotation: current }
  }

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!dragRef.current) return
      const dx = event.clientX - dragRef.current.x
      const dy = event.clientY - dragRef.current.y
      const nextRotation: [number, number, number] = [
        dragRef.current.rotation[0] + dx * 0.2,
        clamp(dragRef.current.rotation[1] - dy * 0.17, -75, 75),
        0,
      ]
      targetRotationRef.current = nextRotation
    }
    const onUp = () => {
      dragRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  function onTouchStart(event: React.TouchEvent<HTMLCanvasElement>) {
    if (event.touches.length === 1) {
      const touch = event.touches[0]
      const current = rotationRef.current
      targetRotationRef.current = current
      dragRef.current = { x: touch.clientX, y: touch.clientY, rotation: current }
      pinchRef.current = null
      return
    }
    if (event.touches.length >= 2) {
      const a = event.touches[0]
      const b = event.touches[1]
      pinchRef.current = {
        distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        scale,
      }
      dragRef.current = null
    }
  }

  function onTouchMove(event: React.TouchEvent<HTMLCanvasElement>) {
    if (event.touches.length === 1 && dragRef.current) {
      const touch = event.touches[0]
      const dx = touch.clientX - dragRef.current.x
      const dy = touch.clientY - dragRef.current.y
      const nextRotation: [number, number, number] = [
        dragRef.current.rotation[0] + dx * 0.22,
        clamp(dragRef.current.rotation[1] - dy * 0.18, -75, 75),
        0,
      ]
      targetRotationRef.current = nextRotation
      return
    }
    if (event.touches.length >= 2 && pinchRef.current) {
      const a = event.touches[0]
      const b = event.touches[1]
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      const ratio = distance / pinchRef.current.distance
      applyScale(pinchRef.current.scale * ratio)
    }
  }

  function resetView() {
    scaleRef.current = GLOBE_DEFAULT_SCALE
    rotationRef.current = GLOBE_DEFAULT_ROTATION
    targetRotationRef.current = GLOBE_DEFAULT_ROTATION
    setRotation(GLOBE_DEFAULT_ROTATION)
    setScale(GLOBE_DEFAULT_SCALE)
    setHoverKey(null)
  }

  return (
    <div
      ref={shellRef}
      className="relative w-full overflow-hidden rounded-md border border-border/60 bg-background/45 text-foreground shadow-[inset_0_0_42px_rgba(148,163,184,0.16)]"
      style={{ aspectRatio: `${MAP_W} / ${MAP_H}`, overscrollBehavior: 'contain' }}
      onClick={() => setHoverKey(null)}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.24),transparent_64%)]" />

      <canvas
        ref={canvasRef}
        width={MAP_W}
        height={MAP_H}
        className="absolute inset-0 h-full w-full touch-none cursor-grab active:cursor-grabbing"
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onTouchMove={event => {
          event.preventDefault()
          onTouchMove(event)
        }}
        onTouchEnd={() => {
          dragRef.current = null
          pinchRef.current = null
        }}
      />


      <div className="absolute right-3 top-3 z-10 flex flex-col gap-2">
        <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-xl bg-background/92 transition-all duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-95" onClick={e => { e.stopPropagation(); applyScale(scale + 16) }}>
          <Plus className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-xl bg-background/92 transition-all duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-95" onClick={e => { e.stopPropagation(); applyScale(scale - 16) }}>
          <Minus className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-xl bg-background/92 transition-all duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-95" onClick={e => { e.stopPropagation(); resetView() }}>
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      <div className="absolute inset-0 pointer-events-none">
        {projected.map(group => {
          const isCluster = group.nodes.length > 1
          const isOpen = hoverKey === group.key
          const color = group.onlineCount > 0 ? GREEN : GRAY

          return (
            <div
              key={group.key}
              className="absolute pointer-events-auto transition-transform duration-300 ease-out will-change-transform"
              style={{ left: `${(group.x / MAP_W) * 100}%`, top: `${(group.y / MAP_H) * 100}%`, transform: `translate(-50%, -50%) scale(${isOpen ? 1.08 : 1})` }}
              onMouseEnter={() => {
                cancelClose()
                setHoverKey(group.key)
              }}
              onMouseLeave={scheduleClose}
            >
              <button
                type="button"
                className="relative flex h-8 w-8 items-center justify-center transition-transform duration-200 ease-out hover:scale-110 active:scale-95"
                onClick={event => {
                  event.stopPropagation()
                  if (isCluster) setHoverKey(isOpen ? null : group.key)
                  else onOpen?.(nodeKey(group.nodes[0]))
                }}
                aria-label={isCluster ? `${group.nodes.length} 个节点` : displayName(group.nodes[0])}
              >
                <span
                  className="absolute rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: isOpen ? 28 : 22,
                    height: isOpen ? 28 : 22,
                    border: `1.2px solid ${color}`,
                    opacity: isOpen ? 0.46 : 0.34,
                  }}
                />
                <span
                  className="absolute rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: isOpen ? 38 : 30,
                    height: isOpen ? 38 : 30,
                    border: `1px solid ${color}`,
                    opacity: isOpen ? 0.2 : 0.1,
                  }}
                />
                {group.onlineCount > 0 && <span className="globe-node-pulse absolute h-5 w-5 rounded-full" style={{ backgroundColor: color }} />}
                <span
                  className="relative flex items-center justify-center rounded-full text-[10px] font-black text-white shadow-[0_0_12px_rgba(15,23,42,0.25)] transition-all duration-300 ease-out"
                  style={{
                    width: isCluster ? 16 : isOpen ? 10 : 9,
                    height: isCluster ? 16 : isOpen ? 10 : 9,
                    backgroundColor: color,
                    border: '1.1px solid rgba(255,255,255,0.95)',
                  }}
                >
                  {isCluster ? group.nodes.length : ''}
                </span>
              </button>

              {isOpen && (
                <MapNodePopoverHtml
                  nodes={group.nodes}
                  x={group.x}
                  y={group.y}
                  onPick={id => {
                    setHoverKey(null)
                    onOpen?.(id)
                  }}
                  onMouseEnter={cancelClose}
                  onMouseLeave={scheduleClose}
                />
              )}
            </div>
          )
        })}
      </div>

      {total === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground pointer-events-none">
          没有节点设置过经纬度
        </div>
      )}

      {!world && total > 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground pointer-events-none">
          正在加载 3D 地球…
        </div>
      )}
    </div>
  )
}

function MapNodePopoverSvg({
  nodes,
  lat,
  lng,
  onPick,
  onMouseEnter,
  onMouseLeave,
}: {
  nodes: Node[]
  lat: number
  lng: number
  onPick: (id: string) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}) {
  const width = 220
  const rowHeight = 80
  const visibleRows = Math.min(nodes.length, 4)
  const height = visibleRows * rowHeight + 14
  const gap = 14

  let x = -width / 2
  if (lng > 70) x = -width + gap
  else if (lng < -70) x = -gap

  const y = lat > 18 ? gap : -height - gap

  return (
    <foreignObject x={x} y={y} width={width} height={height} style={{ overflow: 'visible' }}>
      <MapNodePopoverCard nodes={nodes} onPick={onPick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} />
    </foreignObject>
  )
}

function MapNodePopoverHtml({
  nodes,
  x,
  y,
  onPick,
  onMouseEnter,
  onMouseLeave,
}: {
  nodes: Node[]
  x: number
  y: number
  onPick: (id: string) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}) {
  const openLeft = x > MAP_W * 0.72
  const openTop = y > MAP_H * 0.58

  return (
    <div
      className={cn(
        'absolute z-20 w-[220px]',
        openLeft ? 'right-5' : 'left-5',
        openTop ? 'bottom-5' : 'top-5',
      )}
    >
      <MapNodePopoverCard nodes={nodes} onPick={onPick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} />
    </div>
  )
}

function MapNodePopoverCard({
  nodes,
  onPick,
  onMouseEnter,
  onMouseLeave,
}: {
  nodes: Node[]
  onPick: (id: string) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}) {
  return (
    <div
      className="rounded-sm border border-border/90 bg-card/95 text-card-foreground shadow-[0_14px_30px_rgba(15,23,42,0.14)] backdrop-blur py-1.5 px-1.5 max-h-[334px] overflow-auto animate-in fade-in-0 zoom-in-95 duration-150"
      onClick={e => e.stopPropagation()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {nodes.map((n, index) => {
        const u = deriveUsage(n)
        return (
          <button
            key={nodeKey(n)}
            onClick={() => onPick(nodeKey(n))}
            className={cn(
              'w-full rounded-sm px-2.5 py-2 text-left transition-colors hover:bg-accent/70',
              index !== nodes.length - 1 && 'border-b border-dashed border-border/80',
            )}
          >
            <div className="flex items-start gap-2">
              <span className={cn('mt-1 h-1.5 w-1.5 rounded-full shrink-0', n.online ? 'bg-emerald-500' : 'bg-slate-400')} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] font-bold text-foreground">{displayName(n)}</span>
                  <span className="shrink-0 text-[10px] font-semibold text-muted-foreground uppercase">{n.meta?.region || '—'}</span>
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">{n.source}</div>
                <div className="mt-2 grid grid-cols-[34px_1fr] gap-x-2 gap-y-0.5 text-[10px] leading-4">
                  <span className="text-muted-foreground">CPU</span>
                  <span className="font-mono text-right">{pct(u.cpu)}</span>
                  <span className="text-muted-foreground">内存</span>
                  <span className="font-mono text-right">{pct(u.mem)}</span>
                  <span className="text-muted-foreground">↑ 入</span>
                  <span className="font-mono text-right">{bytes(u.netIn)}/s</span>
                  <span className="text-muted-foreground">↓ 出</span>
                  <span className="font-mono text-right">{bytes(u.netOut)}/s</span>
                  <span className="text-muted-foreground">运行</span>
                  <span className="font-mono text-right">{uptime(u.uptime)}</span>
                </div>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
