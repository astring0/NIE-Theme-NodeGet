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

const VALUE_KEYS = [
  'tcp_ping',
  'tcpPing',
  'ping',
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

export function normalizeTs(ts: number) {
  return ts < 1_000_000_000_000 ? ts * 1000 : ts
}

function asText(v: unknown) {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return ''
  }
}

function eventTypeText(row: TaskQueryResult) {
  const eventType = row.task_event_type
  const parts = [
    row.cron_source,
    (row as unknown as { type?: unknown }).type,
    asText(eventType),
  ]
  if (eventType && typeof eventType === 'object' && !Array.isArray(eventType)) {
    parts.push(...Object.keys(eventType))
    parts.push(...Object.values(eventType as Record<string, unknown>).map(asText))
  }
  return parts.filter(Boolean).join(' ').toLowerCase()
}

export function detectLatencyType(row: TaskQueryResult): LatencyType | null {
  const hay = eventTypeText(row)
  if (/tcp[-_\s]?ping|tcping|tcp_ping/.test(hay)) return 'tcp_ping'
  if (/(^|[^a-z])ping([^a-z]|$)/.test(hay)) return 'ping'

  const resultText = asText(row.task_event_result).toLowerCase()
  if (/tcp[-_\s]?ping|tcping|tcp_ping/.test(resultText)) return 'tcp_ping'
  if (/(^|[^a-z])ping([^a-z]|$)/.test(resultText)) return 'ping'

  return null
}

function numberFromString(s: string) {
  const match = s.match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const n = Number(match[0])
  return Number.isFinite(n) ? n : null
}

function readNumber(value: unknown, preferredType?: LatencyType, depth = 0): number | null {
  if (depth > 5 || value == null) return null

  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') return numberFromString(value)
  if (typeof value !== 'object') return null

  if (Array.isArray(value)) {
    for (let i = value.length - 1; i >= 0; i--) {
      const v = readNumber(value[i], preferredType, depth + 1)
      if (v != null) return v
    }
    return null
  }

  const obj = value as Record<string, unknown>
  const preferredKeys = preferredType
    ? preferredType === 'tcp_ping'
      ? ['tcp_ping', 'tcpPing', 'tcping', 'tcp-ping', 'result', 'latency', 'delay', 'rtt', 'ms', 'value']
      : ['ping', 'result', 'latency', 'delay', 'rtt', 'ms', 'value']
    : VALUE_KEYS

  for (const k of preferredKeys) {
    if (k in obj) {
      const v = readNumber(obj[k], preferredType, depth + 1)
      if (v != null) return v
    }
  }

  for (const v of Object.values(obj)) {
    const n = readNumber(v, preferredType, depth + 1)
    if (n != null) return n
  }

  return null
}

export function extractLatencyValue(row: TaskQueryResult, type: LatencyType): number | null {
  if (row.success === false) return null
  return readNumber(row.task_event_result, type)
}

export function isLatencyRow(row: TaskQueryResult, type?: LatencyType, assumeType = false) {
  const detected = detectLatencyType(row)
  if (type) {
    if (detected === type) return true
    return assumeType && extractLatencyValue(row, type) != null
  }
  return detected != null || readNumber(row.task_event_result) != null
}

export function latencySeriesName(row: TaskQueryResult, type?: LatencyType) {
  const eventType = row.task_event_type
  let name = row.cron_source || ''

  if (!name && eventType && typeof eventType === 'object' && !Array.isArray(eventType)) {
    const values = Object.values(eventType as Record<string, unknown>).map(asText).filter(Boolean)
    const keys = Object.keys(eventType as Record<string, unknown>)
    name = values.find(v => !/^(ping|tcp_ping|tcping|tcp-ping)$/i.test(v)) || keys.join(' / ')
  }

  if (!name) name = type === 'tcp_ping' ? 'TCP Ping' : type === 'ping' ? 'Ping' : '未知'

  return name
    .replace(/^task[-_:\s]*/i, '')
    .replace(/^tcp[-_\s]?ping[-_:：\s]*/i, '')
    .replace(/^tcping[-_:：\s]*/i, '')
    .replace(/^ping[-_:：\s]*/i, '')
    .trim() || name
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

export function computeLatencyStats(rows: TaskQueryResult[], type: LatencyType): LatencyStats[] {
  const stats = seriesNames(rows, type).map<LatencyStats>(name => {
    const list = rows.filter(r => latencySeriesName(r, type) === name)
    const vals: number[] = []
    for (const r of list) {
      const v = extractLatencyValue(r, type)
      if (v != null) vals.push(v)
    }

    const color = latencyColor(name)
    const lossRate = list.length ? ((list.length - vals.length) / list.length) * 100 : 0
    if (!vals.length) return { name, color, avg: null, jitter: null, lossRate }

    const avg = vals.reduce((s, v) => s + v, 0) / vals.length
    const jitter =
      vals.length >= 2
        ? vals.slice(1).reduce((s, v, i) => s + Math.abs(v - vals[i]), 0) / (vals.length - 1)
        : null

    return { name, color, avg, jitter, lossRate }
  })

  return stats.sort((a, b) => {
    const av = a.avg ?? Infinity
    const bv = b.avg ?? Infinity
    if (av !== bv) return av - bv
    const aj = a.jitter ?? Infinity
    const bj = b.jitter ?? Infinity
    if (aj !== bj) return aj - bj
    return a.lossRate - b.lossRate
  })
}
