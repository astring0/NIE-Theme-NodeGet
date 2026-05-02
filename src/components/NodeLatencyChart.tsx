import { useEffect, useMemo, useState } from 'react'
import type { EChartsOption } from 'echarts'
import ReactECharts from 'echarts-for-react'
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
const DEFAULT_WINDOW_MS = 3 * 60 * 60 * 1000

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

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildChartOption(visibleSeries: LatencySeries[], smooth: boolean): EChartsOption {
  const allTimes = visibleSeries.flatMap(series => series.samples.map(sample => sample.t))
  const minTs = allTimes.length ? Math.min(...allTimes) : Date.now()
  const maxTs = allTimes.length ? Math.max(...allTimes) : Date.now()
  const startValue = Math.max(minTs, maxTs - DEFAULT_WINDOW_MS)

  return {
    animation: false,
    grid: { top: 20, right: 18, bottom: 56, left: 56 },
    color: visibleSeries.map(series => series.color),
    legend: { show: false },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      textStyle: { color: '#111827', fontSize: 12 },
      extraCssText: 'box-shadow: 0 8px 28px rgba(0,0,0,0.10); border-radius: 8px;',
      formatter: (params: any) => {
        const list = Array.isArray(params) ? params : [params]
        const first = list[0]
        const timeValue = first?.axisValue ?? first?.value?.[0]
        const header = new Date(Number(timeValue)).toLocaleString()
        const rows = list
          .filter((item: any) => Array.isArray(item.value) && Number.isFinite(item.value[1]))
          .sort((a: any, b: any) => Number(a.value[1]) - Number(b.value[1]))
          .map((item: any) => {
            const color = item.color || '#3b82f6'
            const name = escapeHtml(String(item.seriesName || ''))
            const value = latencyMs(Number(item.value[1]))
            return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:220px;">
              <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                <span style="width:8px;height:8px;border-radius:999px;background:${color};display:inline-block;flex:none;"></span>
                <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</span>
              </div>
              <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${value}</span>
            </div>`
          })
          .join('')
        return `<div style="display:flex;flex-direction:column;gap:6px;">
          <div style="font-weight:600;">${escapeHtml(header)}</div>
          ${rows || '<div>暂无数据</div>'}
        </div>`
      },
    },
    xAxis: {
      type: 'time',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#64748b' },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: 'ms',
      min: 0,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#64748b' },
      splitLine: { lineStyle: { color: 'rgba(100,116,139,0.10)' } },
      nameTextStyle: { color: '#64748b', padding: [0, 0, 0, 4] },
    },
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        startValue,
        endValue: maxTs,
        filterMode: 'none',
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
        preventDefaultMouseMove: true,
      },
      {
        type: 'slider',
        xAxisIndex: 0,
        height: 18,
        bottom: 10,
        brushSelect: false,
        startValue,
        endValue: maxTs,
        filterMode: 'none',
        borderColor: 'rgba(148,163,184,0.25)',
        backgroundColor: 'rgba(148,163,184,0.10)',
        fillerColor: 'rgba(59,130,246,0.12)',
        moveHandleSize: 0,
        handleSize: '100%',
        handleStyle: { color: 'rgba(59,130,246,0.28)' },
      },
    ],
    series: visibleSeries.map(series => ({
      type: 'line',
      name: series.target || series.label,
      data: series.samples.map(sample => [sample.t, sample.value]),
      showSymbol: false,
      smooth,
      lineStyle: { width: 2, color: series.color },
      emphasis: { focus: 'series' },
      connectNulls: true,
      sampling: 'lttb',
    })),
  }
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
  const option = useMemo(() => buildChartOption(visibleSeries, smooth), [visibleSeries, smooth])

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
                <ReactECharts option={option} notMerge={false} lazyUpdate style={{ height: '100%', width: '100%' }} />
              ) : (
                <div className="flex h-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                  请选择下方要显示的监控项目。
                </div>
              )}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">支持最近 1 天数据；鼠标滚轮可缩放，按住左键可左右拖动查看。</div>
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
