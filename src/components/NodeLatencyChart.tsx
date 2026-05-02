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

const LOSS_THRESHOLD = 500

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
      if (aa.type !== bb.type) return aa.type.localeCompare(bb.type)
      return aa.target.localeCompare(bb.target)
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
  const chartData = useMemo(() => buildChartData(typeSeries, selectedKeys), [typeSeries, selectedKeys])
  const latest = visibleSeries
    .map(series => series.latest)
    .sort((a, b) => b.t - a.t)[0]

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
          <div className="min-w-[6rem] text-right">
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
            <div className="h-72">
              {visibleSeries.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <XAxis
                      dataKey="t"
                      minTickGap={26}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      tickFormatter={t => new Date(Number(t)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    />
                    <YAxis
                      width={46}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      tickFormatter={v => `${Math.round(Number(v))}`}
                      domain={[0, 'auto']}
                      label={{ value: 'ms', angle: -90, position: 'insideLeft', style: { fill: 'hsl(var(--muted-foreground))', fontSize: 11 } }}
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
                        name={series.target || series.label}
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
                <div className="flex h-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                  请选择下方要显示的监控项目。
                </div>
              )}
            </div>
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
