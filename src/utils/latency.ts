import type { LatencyType, TaskQueryResult } from '../types'

const COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#14b8a6',
]

const FALLBACK_VALUE_KEYS = [
  'latency',
  'delay',
  'rtt',
  'time',
  'ms',
  'avg',
  'value',
  'result',
  'duration',
]

export function latencyColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length]
}

export function qualitySegmentColor(v: number | null) {
  if (v == null) return '#dc2626' // 丢包 / 无数据：深红
  if (v <= 45) return '#16a34a' // <=45ms：深绿
  if (v <= 90) return '#84cc16' // 45-90ms：浅绿
  if (v <= 160) return '#fde047' // 90-160ms：浅黄
  if (v <= 300) return '#f59e0b' // 160-300ms：深黄
  return '#f87171' // >300ms：浅红
}

export function normalizeTs(ts: number) {
  return ts < 1_000_000_000_000 ? ts * 1000 : ts
}

function numberFromString(s: string) {
  const match = s.match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const n = Number(match[0])
  return Number.isFinite(n) ? n : null
}

function readNumber(value: unknown, depth = 0): number | null {
  if (depth > 5 || value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') return numberFromString(value)
  if (typeof value !== 'object') return null

  if (Array.isArray(value)) {
    for (let i = value.length - 1; i >= 0; i--) {
      const v = readNumber(value[i], depth + 1)
      if (v != null) return v
    }
    return null
  }

  const obj = value as Record<string, unknown>
  for (const key of FALLBACK_VALUE_KEYS) {
    if (key in obj) {
      const v = readNumber(obj[key], depth + 1)
      if (v != null) return v
    }
  }
  for (const v of Object.values(obj)) {
    const n = readNumber(v, depth + 1)
    if (n != null) return n
  }
  return null
}

export function extractLatencyValue(row: TaskQueryResult, type: LatencyType): number | null {
  if (!row.success) return null
  const result = row.task_event_result
  if (!result) return null

  const direct = (result as Record<string, unknown>)[type]
  if (typeof direct === 'number') return Number.isFinite(direct) ? direct : null

  const directNested = readNumber(direct)
  if (directNested != null) return directNested

  return readNumber(result)
}

export function latencySeriesName(row: TaskQueryResult, type?: LatencyType) {
  const name = row.cron_source || (type === 'tcp_ping' ? 'TCP Ping' : type === 'ping' ? 'Ping' : '未知')
  return name.trim() || '未知'
}

function seriesNames(rows: TaskQueryResult[], type: LatencyType) {
  const set = new Set<string>()
  for (const r of rows) set.add(latencySeriesName(r, type))
  return [...set].sort((a, b) => a.localeCompare(b))
}

export interface ChartPoint {
  t: number
  [series: string]: number | null
}

export interface ChartSeries {
  name: string
  color: string
}

function forwardFill(data: ChartPoint[], names: string[]) {
  const last: Record<string, number | null> = {}
  for (const n of names) last[n] = null
  for (const pt of data) {
    for (const n of names) {
      const v = pt[n]
      if (v == null) pt[n] = last[n]
      else last[n] = v
    }
  }
}


export function latencyRowsToHistory(rows: TaskQueryResult[], type: LatencyType) {
  return rows
    .filter(row => row.success && extractLatencyValue(row, type) != null)
    .map(row => ({
      t: normalizeTs(row.timestamp),
      cpu: null,
      mem: null,
      disk: null,
      netIn: 0,
      netOut: 0,
    }))
    .sort((a, b) => a.t - b.t)
}

export function buildLatencyChart(rows: TaskQueryResult[], type: LatencyType) {
  const names = seriesNames(rows, type)
  const series: ChartSeries[] = names.map(name => ({ name, color: latencyColor(name) }))
  const byTs = new Map<number, ChartPoint>()

  for (const r of rows) {
    const t = normalizeTs(r.timestamp)
    const name = latencySeriesName(r, type)
    let pt = byTs.get(t)
    if (!pt) {
      pt = { t }
      for (const n of names) pt[n] = null
      byTs.set(t, pt)
    }
    pt[name] = extractLatencyValue(r, type)
  }

  const data = [...byTs.values()].sort((a, b) => a.t - b.t)
  forwardFill(data, names)
  return { data, series }
}

export interface LatencyStats {
  name: string
  color: string
  avg: number | null
  jitter: number | null
  lossRate: number
}

export interface LatencyQualityRow extends LatencyStats {
  values: (number | null)[]
}

export function buildLatencyQualityRows(
  rows: TaskQueryResult[],
  type: LatencyType,
  segments = 72,
): LatencyQualityRow[] {
  return seriesNames(rows, type)
    .map<LatencyQualityRow>(name => {
      const list = rows.filter(r => latencySeriesName(r, type) === name)
      const values = list.slice(-segments).map(r => extractLatencyValue(r, type))
      while (values.length < segments) values.unshift(null)
      const vals = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      const lossRate = values.length ? ((values.length - vals.length) / values.length) * 100 : 0
      const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null
      const jitter = vals.length >= 2
        ? vals.slice(1).reduce((s, v, i) => s + Math.abs(v - vals[i]), 0) / (vals.length - 1)
        : null
      return {
        name,
        color: latencyColor(name),
        avg,
        jitter,
        lossRate,
        values,
      }
    })
    .sort((a, b) => {
      const av = a.avg ?? Infinity
      const bv = b.avg ?? Infinity
      if (av !== bv) return av - bv
      const aj = a.jitter ?? Infinity
      const bj = b.jitter ?? Infinity
      if (aj !== bj) return aj - bj
      return a.lossRate - b.lossRate
    })
}

export function computeLatencyStats(rows: TaskQueryResult[], type: LatencyType): LatencyStats[] {
  return buildLatencyQualityRows(rows, type, 72).map(({ name, color, avg, jitter, lossRate }) => ({
    name,
    color,
    avg,
    jitter,
    lossRate,
  }))
}
