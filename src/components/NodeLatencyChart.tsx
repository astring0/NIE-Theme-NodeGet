import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent, WheelEvent } from 'react'
import { AlertCircle, Check, Loader2 } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '../utils/cn'
import { latencyMs, relativeAge } from '../utils/format'
import { useNodeLatency } from '../hooks/useNodeLatency'
import type { BackendToken } from '../api/pool'
import type { LatencySample, LatencyTaskType, Node } from '../types'

const TYPE_LABEL: Record<LatencyTaskType, string> = {
  ping: 'Ping',
  tcp_ping: 'TCP Ping',
  http_ping: 'HTTP Ping',
}

const SERIES_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ef4444',
  '#06b6d4',
  '#84cc16',
  '#ec4899',
  '#f97316',
  '#6366f1',
]

const LOSS_THRESHOLD = 500
const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_WINDOW_MS = 3 * 60 * 60 * 1000
const MIN_WINDOW_MS = 60 * 1000
const CHART_W = 1000
const CHART_H = 320
const M = { top: 18, right: 18, bottom: 36, left: 48 }
const PLOT_W = CHART_W - M.left - M.right
const PLOT_H = CHART_H - M.top - M.bottom

interface Props {
  node: Node
  backend?: BackendToken | null
}

interface LatencySeries {
  key: string
  label: string
  type: LatencyTaskType
  target: string
  color: string
  samples: LatencySample[]
  latest: LatencySample
}

interface HoverRow {
  key: string
  label: string
  color: string
  sample: LatencySample
  x: number
  y: number
}

function seriesKeyOf(sample: LatencySample) {
  return `${sample.type}::${sample.target || 'unknown'}`
}

function seriesLabel(type: LatencyTaskType, target: string) {
  const cleanTarget = target?.trim() || '未知目标'
  return `${TYPE_LABEL[type]} · ${cleanTarget}`
}

function buildSeries(samples: LatencySample[]): LatencySeries[] {
  const map = new Map<string, LatencySample[]>()

  for (const sample of samples) {
    const key = seriesKeyOf(sample)
    const list = map.get(key) ?? []
    list.push(sample)
    map.set(key, list)
  }

  return [...map.entries()]
    .map(([key, list]) => {
      const ordered = [...list].sort((a, b) => a.t - b.t)
      const latest = ordered.at(-1)
      if (!latest) return null
      return {
        key,
        label: seriesLabel(latest.type, latest.target),
        type: latest.type,
        target: latest.target,
        color: '#3b82f6',
        samples: ordered,
        latest,
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aa = a as LatencySeries
      const bb = b as LatencySeries
      if (aa.type !== bb.type) return aa.type.localeCompare(bb.type)
      return aa.target.localeCompare(bb.target)
    })
    .map((series, idx) => ({
      ...(series as LatencySeries),
      color: SERIES_COLORS[idx % SERIES_COLORS.length],
    }))
}

function average(values: number[]) {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function jitter(values: number[]) {
  if (values.length < 2) return null
  const diffs: number[] = []
  for (let i = 1; i < values.length; i++) {
    diffs.push(Math.abs(values[i] - values[i - 1]))
  }
  return average(diffs)
}

function lossRate(values: number[]) {
  if (!values.length) return null
  const bad = values.filter(value => value >= LOSS_THRESHOLD).length
  return (bad / values.length) * 100
}

function preferredType(types: LatencyTaskType[]) {
  if (types.includes('tcp_ping')) return 'tcp_ping'
  if (types.includes('ping')) return 'ping'
  return types[0] ?? 'tcp_ping'
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function fullDomainOf(series: LatencySeries[]): [number, number] {
  const times = series.flatMap(item => item.samples.map(sample => sample.t))
  const now = Date.now()
  const min = times.length ? Math.min(...times) : now - DEFAULT_WINDOW_MS
  const max = times.length ? Math.max(...times) : now
  return max <= min ? [min - DEFAULT_WINDOW_MS, max + 1] : [Math.max(min, max - DAY_MS), max]
}

function defaultDomainOf(series: LatencySeries[]): [number, number] {
  const [min, max] = fullDomainOf(series)
  return [Math.max(min, max - DEFAULT_WINDOW_MS), max]
}

function clampDomain(start: number, end: number, fullStart: number, fullEnd: number): [number, number] {
  const fullWindow = Math.max(fullEnd - fullStart, MIN_WINDOW_MS)
  const window = clamp(end - start, MIN_WINDOW_MS, fullWindow)
  let nextStart = start
  let nextEnd = start + window

  if (nextEnd > fullEnd) {
    nextEnd = fullEnd
    nextStart = nextEnd - window
  }
  if (nextStart < fullStart) {
    nextStart = fullStart
    nextEnd = nextStart + window
  }
  return [nextStart, nextEnd]
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function findNearest(samples: LatencySample[], t: number) {
  if (!samples.length) return null
  let lo = 0
  let hi = samples.length - 1
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (samples[mid].t < t) lo = mid + 1
    else hi = mid
  }
  const right = samples[lo]
  const left = samples[lo - 1]
  if (!left) return right
  if (!right) return left
  return Math.abs(left.t - t) <= Math.abs(right.t - t) ? left : right
}

function makeLinePath(points: [number, number][], smooth: boolean) {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`
  if (!smooth) return points.map((p, i) => `${i ? 'L' : 'M'} ${p[0]} ${p[1]}`).join(' ')

  let d = `M ${points[0][0]} ${points[0][1]}`
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i]
    const [nx, ny] = points[i + 1]
    const mx = (x + nx) / 2
    const my = (y + ny) / 2
    d += ` Q ${x} ${y} ${mx} ${my}`
  }
  const last = points.at(-1)!
  d += ` L ${last[0]} ${last[1]}`
  return d
}

export function NodeLatencyChart({ node, backend }: Props) {
  const { samples, loading, error } = useNodeLatency(backend, node.uuid)
  const [selectedType, setSelectedType] = useState<LatencyTaskType>('tcp_ping')
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [smooth, setSmooth] = useState(true)

  const seriesList = useMemo(() => buildSeries(samples), [samples])
  const availableTypes = useMemo(
    () => [...new Set(seriesList.map(series => series.type))] as LatencyTaskType[],
    [seriesList],
  )

  useEffect(() => {
    setSmooth(true)
  }, [node.uuid])

  useEffect(() => {
    if (!availableTypes.length) return
    if (!availableTypes.includes(selectedType)) {
      setSelectedType(preferredType(availableTypes))
    }
  }, [availableTypes, selectedType])

  const typeSeries = useMemo(
    () => seriesList.filter(series => series.type === selectedType),
    [seriesList, selectedType],
  )

  useEffect(() => {
    if (!typeSeries.length) {
      setSelectedKeys([])
      return
    }
    const currentKeys = typeSeries.map(series => series.key)
    setSelectedKeys(prev => {
      const kept = prev.filter(key => currentKeys.includes(key))
      return kept.length ? kept : currentKeys
    })
  }, [selectedType, typeSeries])

  const visibleSeries = useMemo(
    () => typeSeries.filter(series => selectedKeys.includes(series.key)),
    [typeSeries, selectedKeys],
  )
  const latest = visibleSeries.map(series => series.latest).sort((a, b) => b.t - a.t)[0]

  const toggleSeries = (key: string) => {
    setSelectedKeys(prev => (prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key]))
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="text-lg font-semibold">{TYPE_LABEL[selectedType] || '延迟'}</div>
          <div className="flex flex-wrap gap-2">
            {availableTypes.map(type => (
              <Button
                key={type}
                type="button"
                size="sm"
                variant={selectedType === type ? 'default' : 'outline'}
                onClick={() => setSelectedType(type)}
                className="h-8"
              >
                {TYPE_LABEL[type]}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={smooth ? 'default' : 'outline'}
            onClick={() => setSmooth(v => !v)}
            className="h-8"
          >
            平滑
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setSelectedKeys(typeSeries.map(series => series.key))}
            className="h-8"
          >
            全选
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setSelectedKeys([])}
            className="h-8"
          >
            清空
          </Button>
          <div className="min-w-[7rem] text-right">
            <div className="text-3xl font-semibold font-mono leading-none">{latest ? latencyMs(latest.value) : '—'}</div>
            <div className="mt-1 text-xs text-muted-foreground">{latest ? relativeAge(latest.t) : loading ? '读取中…' : '暂无数据'}</div>
          </div>
        </div>
      </div>

      {error && !samples.length ? (
        <div className="flex h-36 items-center justify-center gap-2 p-5 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          <span>延迟数据读取失败：{error}</span>
        </div>
      ) : typeSeries.length ? (
        <>
          <div className="px-4 py-3 sm:px-5">
            <div className="h-80">
              {visibleSeries.length ? (
                <InteractiveLatencyChart series={visibleSeries} smooth={smooth} domainKey={`${node.uuid}-${selectedType}`} />
              ) : (
                <div className="flex h-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                  请选择下方要显示的监控项目。
                </div>
              )}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">支持最近 1 天数据；鼠标滚轮缩放，按住左键左右拖动，悬停显示所有已选监控项延迟。</div>
          </div>

          <div className="border-t px-5 py-4">
            <div className="mb-3 hidden grid-cols-[minmax(0,1.3fr)_minmax(220px,1fr)_110px_90px_80px] gap-4 text-sm text-muted-foreground lg:grid">
              <div>来源</div>
              <div>质量</div>
              <div className="text-right">平均延迟</div>
              <div className="text-right">抖动</div>
              <div className="text-right">丢包率</div>
            </div>

            <div className="space-y-3">
              {typeSeries.map(series => {
                const active = selectedKeys.includes(series.key)
                const values = series.samples.map(sample => sample.value).filter(Number.isFinite)
                const avg = average(values)
                const jit = jitter(values)
                const loss = lossRate(values)
                return (
                  <div
                    key={series.key}
                    className={cn(
                      'grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(220px,1fr)_110px_90px_80px] lg:items-center',
                      !active && 'opacity-45',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSeries(series.key)}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent',
                        active && 'bg-accent/50',
                      )}
                    >
                      <span className="h-0.5 w-5 shrink-0 rounded-full" style={{ backgroundColor: series.color }} />
                      <span className="min-w-0 flex-1 truncate text-sm">{series.target || series.label}</span>
                      {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>

                    <div className="lg:px-2">
                      <div className="mb-1 text-xs text-muted-foreground lg:hidden">质量</div>
                      <QualityStrip samples={series.samples} color={series.color} />
                    </div>

                    <MetricCell label="平均延迟" value={latencyMs(avg)} />
                    <MetricCell label="抖动" value={latencyMs(jit)} />
                    <MetricCell label="丢包率" value={loss == null ? '—' : `${loss.toFixed(1)}%`} danger={loss != null && loss >= 3} />
                  </div>
                )
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="flex h-36 items-center justify-center px-5 text-sm text-muted-foreground">
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在读取历史延迟…
            </span>
          ) : (
            '暂无延迟记录；需要后端已有 ping / tcp_ping / http_ping 任务结果。'
          )}
        </div>
      )}
    </div>
  )
}

function InteractiveLatencyChart({ series, smooth, domainKey }: { series: LatencySeries[]; smooth: boolean; domainKey: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const fullDomain = useMemo(() => fullDomainOf(series), [series])
  const [domain, setDomain] = useState<[number, number]>(() => defaultDomainOf(series))
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null)
  const [drag, setDrag] = useState<{ x: number; start: number; end: number } | null>(null)

  useEffect(() => {
    setDomain(defaultDomainOf(series))
    setHover(null)
    setDrag(null)
  }, [domainKey, series])

  const [domainStart, domainEnd] = clampDomain(domain[0], domain[1], fullDomain[0], fullDomain[1])
  const visibleSamples = series.flatMap(item => item.samples.filter(sample => sample.t >= domainStart && sample.t <= domainEnd))
  const rawMax = Math.max(...visibleSamples.map(sample => sample.value), 1)
  const yMax = Math.max(10, Math.ceil(rawMax * 1.15))
  const xScale = (t: number) => M.left + ((t - domainStart) / Math.max(domainEnd - domainStart, 1)) * PLOT_W
  const yScale = (v: number) => M.top + (1 - v / yMax) * PLOT_H
  const tFromClientX = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return domainStart
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
    const svgX = ratio * CHART_W
    const plotRatio = clamp((svgX - M.left) / PLOT_W, 0, 1)
    return domainStart + plotRatio * (domainEnd - domainStart)
  }
  const svgXFromClientX = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return M.left
    return clamp(((clientX - rect.left) / rect.width) * CHART_W, M.left, CHART_W - M.right)
  }

  const paths = series.map(item => {
    const inView = item.samples.filter(sample => sample.t >= domainStart && sample.t <= domainEnd)
    const points = inView.map(sample => [xScale(sample.t), yScale(sample.value)] as [number, number])
    return { ...item, path: makeLinePath(points, smooth) }
  })

  const hoverRows: HoverRow[] = hover
    ? series
        .map(item => {
          const sample = findNearest(item.samples, hover.t)
          if (!sample) return null
          return {
            key: item.key,
            label: item.target || item.label,
            color: item.color,
            sample,
            x: xScale(sample.t),
            y: yScale(sample.value),
          }
        })
        .filter(Boolean)
        .sort((a, b) => (a as HoverRow).sample.value - (b as HoverRow).sample.value) as HoverRow[]
    : []

  const xTicks = Array.from({ length: 8 }, (_, i) => domainStart + ((domainEnd - domainStart) * i) / 7)
  const yTicks = Array.from({ length: 5 }, (_, i) => (yMax * i) / 4)

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const fullWindow = Math.max(fullDomain[1] - fullDomain[0], MIN_WINDOW_MS)
    const currentWindow = domainEnd - domainStart
    const factor = event.deltaY > 0 ? 1.2 : 0.82
    const nextWindow = clamp(currentWindow * factor, MIN_WINDOW_MS, fullWindow)
    const center = tFromClientX(event.clientX)
    const ratio = clamp((center - domainStart) / Math.max(currentWindow, 1), 0, 1)
    const nextStart = center - nextWindow * ratio
    const nextEnd = nextStart + nextWindow
    setDomain(clampDomain(nextStart, nextEnd, fullDomain[0], fullDomain[1]))
  }

  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    setDrag({ x: event.clientX, start: domainStart, end: domainEnd })
  }

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (drag) {
      const rect = wrapRef.current?.getBoundingClientRect()
      const width = rect?.width || 1
      const dx = event.clientX - drag.x
      const shift = -(dx / width) * (drag.end - drag.start)
      setDomain(clampDomain(drag.start + shift, drag.end + shift, fullDomain[0], fullDomain[1]))
      return
    }
    setHover({ x: svgXFromClientX(event.clientX), t: tFromClientX(event.clientX) })
  }

  const handleMouseUp = () => setDrag(null)
  const handleMouseLeave = () => {
    setDrag(null)
    setHover(null)
  }

  return (
    <div
      ref={wrapRef}
      className={cn('relative h-full w-full select-none touch-none', drag ? 'cursor-grabbing' : 'cursor-crosshair')}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="h-full w-full overflow-visible">
        <rect x={M.left} y={M.top} width={PLOT_W} height={PLOT_H} fill="transparent" />
        {yTicks.map(value => {
          const y = yScale(value)
          return (
            <g key={value}>
              <line x1={M.left} x2={CHART_W - M.right} y1={y} y2={y} stroke="rgba(100,116,139,0.12)" />
              <text x={M.left - 10} y={y + 4} textAnchor="end" fontSize="12" fill="#64748b">
                {Math.round(value)}
              </text>
            </g>
          )
        })}
        <text x={10} y={M.top + PLOT_H / 2} transform={`rotate(-90 10 ${M.top + PLOT_H / 2})`} fontSize="12" fill="#64748b">
          ms
        </text>
        {xTicks.map(t => {
          const x = xScale(t)
          return (
            <g key={t}>
              <line x1={x} x2={x} y1={M.top} y2={M.top + PLOT_H} stroke="rgba(100,116,139,0.08)" />
              <text x={x} y={CHART_H - 10} textAnchor="middle" fontSize="12" fill="#64748b">
                {formatTime(t)}
              </text>
            </g>
          )
        })}
        {paths.map(item => item.path && (
          <path key={item.key} d={item.path} fill="none" stroke={item.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {hover && (
          <>
            <line x1={hover.x} x2={hover.x} y1={M.top} y2={M.top + PLOT_H} stroke="rgba(15,23,42,0.25)" strokeDasharray="4 4" />
            {hoverRows.map(row => (
              <circle key={row.key} cx={row.x} cy={row.y} r="3.2" fill="white" stroke={row.color} strokeWidth="2" />
            ))}
          </>
        )}
      </svg>

      {hoverRows.length > 0 && hover && (
        <div
          className="pointer-events-none absolute z-10 max-w-[22rem] rounded-lg border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
          style={{ left: `${clamp((hover.x / CHART_W) * 100, 4, 72)}%`, top: 12 }}
        >
          <div className="mb-1 font-medium">{new Date(hover.t).toLocaleString()}</div>
          <div className="space-y-1">
            {hoverRows.map(row => (
              <div key={row.key} className="flex min-w-56 items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                  <span className="truncate">{row.label}</span>
                </div>
                <span className="font-mono">{latencyMs(row.sample.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCell({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-md px-2 py-1 text-right lg:rounded-none lg:px-0 lg:py-0">
      <div className="text-xs text-muted-foreground lg:hidden">{label}</div>
      <div className={cn('font-mono text-sm', danger && 'text-destructive')}>{value}</div>
    </div>
  )
}

function QualityStrip({ samples, color }: { samples: LatencySample[]; color: string }) {
  const last = samples.slice(-40)
  const maxValue = Math.max(...last.map(item => item.value), 1)

  return (
    <svg viewBox="0 0 240 18" className="h-7 w-full">
      <line x1="0" y1="16" x2="240" y2="16" stroke="hsl(var(--border))" strokeWidth="1" />
      {last.map((sample, idx) => {
        const x = last.length <= 1 ? 2 : (idx / (last.length - 1)) * 236 + 2
        const isLoss = sample.value >= LOSS_THRESHOLD
        const normalized = Math.max(0.08, Math.min(1, sample.value / maxValue))
        const height = isLoss ? 14 : Math.max(2, normalized * 6)
        const y = 16 - height
        return (
          <line
            key={`${sample.id}-${idx}`}
            x1={x}
            y1={16}
            x2={x}
            y2={y}
            stroke={isLoss ? '#ef4444' : color}
            strokeWidth={isLoss ? 2 : 1.4}
            strokeLinecap="round"
          />
        )
      })}
    </svg>
  )
}
