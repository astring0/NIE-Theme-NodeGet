import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertCircle, Check, Loader2 } from 'lucide-react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useNodeLatency } from '../hooks/useNodeLatency'
import { Button } from './ui/button'
import { cn } from '../utils/cn'
import { latencyMs, relativeAge } from '../utils/format'
import type { BackendToken } from '../api/pool'
import type { LatencySample, LatencyTaskType, Node } from '../types'

const TOOLTIP_STYLE = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 6,
  fontSize: 11,
}

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

interface ChartRow {
  t: number
  [seriesKey: string]: number
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
      return (bb.latest.t || 0) - (aa.latest.t || 0)
    })
    .map((series, idx) => ({
      ...(series as LatencySeries),
      color: SERIES_COLORS[idx % SERIES_COLORS.length],
    }))
}

function buildChartData(seriesList: LatencySeries[], selectedKeys: string[]) {
  const selectedSet = new Set(selectedKeys)
  const rows = new Map<number, ChartRow>()

  for (const series of seriesList) {
    if (!selectedSet.has(series.key)) continue
    for (const sample of series.samples) {
      const row = rows.get(sample.t) ?? ({ t: sample.t } as ChartRow)
      row[series.key] = sample.value
      rows.set(sample.t, row)
    }
  }

  return [...rows.values()].sort((a, b) => a.t - b.t)
}

function flattenSelectedValues(seriesList: LatencySeries[], selectedKeys: string[]) {
  const selected = new Set(selectedKeys)
  return seriesList
    .filter(series => selected.has(series.key))
    .flatMap(series => series.samples.map(sample => sample.value))
    .filter(Number.isFinite)
}

export function NodeLatencyChart({ node, backend }: Props) {
  const { samples, loading, error } = useNodeLatency(backend, node.uuid)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [smooth, setSmooth] = useState(true)
  const [selectionInitialized, setSelectionInitialized] = useState(false)

  const seriesList = useMemo(() => buildSeries(samples), [samples])

  useEffect(() => {
    setSelectedKeys([])
    setSelectionInitialized(false)
    setSmooth(true)
  }, [node.uuid])

  useEffect(() => {
    if (!seriesList.length) {
      if (!selectionInitialized) setSelectedKeys([])
      return
    }

    const available = new Set(seriesList.map(series => series.key))

    if (!selectionInitialized) {
      setSelectedKeys(seriesList.map(series => series.key))
      setSelectionInitialized(true)
      return
    }

    setSelectedKeys(prev => prev.filter(key => available.has(key)))
  }, [seriesList, selectionInitialized])

  const visibleSeries = useMemo(
    () => seriesList.filter(series => selectedKeys.includes(series.key)),
    [seriesList, selectedKeys],
  )
  const latest = visibleSeries
    .map(series => series.latest)
    .sort((a, b) => b.t - a.t)[0]
  const chartData = useMemo(() => buildChartData(seriesList, selectedKeys), [seriesList, selectedKeys])
  const values = useMemo(() => flattenSelectedValues(seriesList, selectedKeys), [seriesList, selectedKeys])
  const avg = values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null
  const min = values.length ? Math.min(...values) : null
  const max = values.length ? Math.max(...values) : null

  const toggleSeries = (key: string) => {
    setSelectedKeys(prev => (prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key]))
  }

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">延迟</div>
          <div className="mt-1 flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">
              {visibleSeries.length
                ? `${visibleSeries.length} 个监控项${visibleSeries.length > 1 ? ' · 可叠加显示' : ''}`
                : seriesList.length
                  ? '请选择要显示的监控项'
                  : 'Ping / TCP Ping / HTTP Ping'}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold font-mono leading-none">
            {latest ? latencyMs(latest.value) : '—'}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {latest ? relativeAge(latest.t) : loading ? '读取中…' : '暂无数据'}
          </div>
        </div>
      </div>

      {error && !samples.length ? (
        <div className="h-36 rounded-md border border-dashed flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          <span>延迟数据读取失败：{error}</span>
        </div>
      ) : seriesList.length ? (
        <>
          <div className="h-52">
            {visibleSeries.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <XAxis
                    dataKey="t"
                    minTickGap={26}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={t => new Date(Number(t)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  />
                  <YAxis
                    width={42}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={v => `${Math.round(Number(v))}`}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={t => new Date(Number(t)).toLocaleString()}
                    formatter={(v, name) => [latencyMs(Number(v)), String(name)]}
                  />
                  {visibleSeries.map(series => (
                    <Line
                      key={series.key}
                      type={smooth ? 'monotone' : 'linear'}
                      dataKey={series.key}
                      name={series.label}
                      stroke={series.color}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full rounded-md border border-dashed flex items-center justify-center text-sm text-muted-foreground">
                请选择下方要显示的监控项目。
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
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
              onClick={() => setSelectedKeys(seriesList.map(series => series.key))}
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
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {seriesList.map(series => {
              const active = selectedKeys.includes(series.key)
              return (
                <button
                  key={series.key}
                  type="button"
                  onClick={() => toggleSeries(series.key)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors',
                    active
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:bg-accent',
                  )}
                  title={series.label}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: series.color }}
                    aria-hidden="true"
                  />
                  <span className="max-w-[18rem] truncate">{series.target || TYPE_LABEL[series.type]}</span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <div className="h-36 rounded-md border border-dashed flex items-center justify-center text-sm text-muted-foreground">
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

      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <Stat label="最低" value={min} />
        <Stat label="平均" value={avg} />
        <Stat label="最高" value={max} />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-md border bg-card/50 px-3 py-2">
      <div className="mb-1 text-[11px] text-muted-foreground">{label}</div>
      <div className="font-mono text-sm">{value == null ? '—' : latencyMs(value)}</div>
    </div>
  )
}
