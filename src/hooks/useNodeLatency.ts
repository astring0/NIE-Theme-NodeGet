import { useEffect, useState } from 'react'
import { taskQuery } from '../api/methods'
import { detectLatencyType, extractLatencyValue, isLatencyRow, normalizeTs } from '../utils/latency'
import type { RpcClient } from '../api/client'
import type { BackendPool } from '../api/pool'
import type { LatencyType, TaskQueryCondition, TaskQueryResult } from '../types'

const WINDOW_MS = 60 * 60 * 1000
const REFRESH_MS = 10_000
const QUERY_TIMEOUT_MS = 20_000
const QUERY_LIMIT = 1200

export interface LatencyQueryState {
  pingData: TaskQueryResult[]
  tcpData: TaskQueryResult[]
  loading: boolean
  error: string | null
}

function rowKey(row: TaskQueryResult) {
  return [
    row.task_id ?? '',
    row.uuid ?? '',
    row.timestamp ?? '',
    row.cron_source ?? '',
    JSON.stringify(row.task_event_type ?? ''),
    JSON.stringify(row.task_event_result ?? ''),
  ].join('|')
}

function dedupe(rows: TaskQueryResult[]) {
  const seen = new Set<string>()
  const out: TaskQueryResult[] = []
  for (const row of rows) {
    const key = rowKey(row)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out.sort((a, b) => normalizeTs(a.timestamp) - normalizeTs(b.timestamp))
}

function filterRows(rows: TaskQueryResult[], type: LatencyType, assumeType = false) {
  return dedupe(
    (rows ?? []).filter(row => {
      if (!row || !row.timestamp) return false
      if (!isLatencyRow(row, type, assumeType)) return false
      const detected = detectLatencyType(row)
      if (detected === type) return true
      if (assumeType && extractLatencyValue(row, type) != null) return true
      return false
    }),
  )
}

function conditionVariants(uuid: string, window: [number, number], type: LatencyType): { cond: TaskQueryCondition[]; assume: boolean }[] {
  return [
    {
      cond: [{ uuid, timestamp_from_to: window, type, limit: QUERY_LIMIT }],
      assume: true,
    },
    {
      cond: [{ uuid, timestamp_from: window[0], timestamp_to: window[1], type, limit: QUERY_LIMIT }],
      assume: true,
    },
    {
      cond: [{ uuid, timestamp_from_to: window, limit: QUERY_LIMIT }],
      assume: false,
    },
    {
      cond: [{ uuid, timestamp_from: window[0], timestamp_to: window[1], limit: QUERY_LIMIT }],
      assume: false,
    },
    {
      cond: [{ uuid }, { timestamp_from_to: window }, { type }, { limit: QUERY_LIMIT }],
      assume: true,
    },
  ]
}

export async function fetchLatencyRows(client: RpcClient, uuid: string, type: LatencyType, timeoutMs = QUERY_TIMEOUT_MS) {
  const now = Date.now()
  const window: [number, number] = [now - WINDOW_MS, now]
  const errors: string[] = []
  const collected: TaskQueryResult[] = []

  for (const { cond, assume } of conditionVariants(uuid, window, type)) {
    try {
      const rows = await taskQuery(client, cond, timeoutMs)
      const matched = filterRows(rows, type, assume)
      collected.push(...matched)
      if (matched.length > 0) break
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }

  const result = dedupe(collected)
  if (!result.length && errors.length) {
    throw new Error(errors[0])
  }

  return result
}

export function useNodeLatency(
  pool: BackendPool | null,
  source: string | null,
  uuid: string | null,
): LatencyQueryState {
  const [pingData, setPingData] = useState<TaskQueryResult[]>([])
  const [tcpData, setTcpData] = useState<TaskQueryResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPingData([])
    setTcpData([])
    setError(null)

    if (!pool || !source || !uuid) return
    const entry = pool.entries.find(e => e.name === source)
    if (!entry) return

    let cancelled = false

    const fetchOnce = async () => {
      setLoading(true)

      const [ping, tcp] = await Promise.allSettled([
        fetchLatencyRows(entry.client, uuid, 'ping'),
        fetchLatencyRows(entry.client, uuid, 'tcp_ping'),
      ])

      if (cancelled) return

      if (ping.status === 'fulfilled') setPingData(ping.value)
      if (tcp.status === 'fulfilled') setTcpData(tcp.value)

      const messages = [ping, tcp]
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map(r => (r.reason instanceof Error ? r.reason.message : String(r.reason)))

      setError(messages.length ? messages.join('；') : null)
      setLoading(false)
    }

    fetchOnce()
    const timer = setInterval(fetchOnce, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [pool, source, uuid])

  return { pingData, tcpData, loading, error }
}
