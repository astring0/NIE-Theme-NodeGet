import { useEffect, useState } from 'react'
import { taskQuery } from '../api/methods'
import { normalizeTs } from '../utils/latency'
import type { RpcClient } from '../api/client'
import type { BackendPool } from '../api/pool'
import type { LatencyType, TaskQueryResult } from '../types'

const WINDOW_MS = 60 * 60 * 1000
const REFRESH_MS = 10_000
const QUERY_TIMEOUT_MS = 20_000

export interface LatencyQueryState {
  pingData: TaskQueryResult[]
  tcpData: TaskQueryResult[]
  loading: boolean
  error: string | null
}

function clean(rows: TaskQueryResult[] | undefined): TaskQueryResult[] {
  return (rows ?? [])
    .filter(r => r.cron_source && r.cron_source !== '未知')
    .sort((a, b) => normalizeTs(a.timestamp) - normalizeTs(b.timestamp))
}

export async function fetchLatencyRows(
  client: RpcClient,
  uuid: string,
  type: LatencyType,
  timeoutMs = QUERY_TIMEOUT_MS,
  windowMs = WINDOW_MS,
) {
  const now = Date.now()
  const window: [number, number] = [now - windowMs, now]

  // 这里刻意保持和原版 StatusShow 一样的 task_query 参数格式。
  // 部分 NodeGet 后端版本不支持把 uuid / timestamp / type / limit 合并进同一个 condition 对象，
  // 也不支持 limit 条件；一旦加了这些，接口会返回空或报错，导致延迟图表完全不显示。
  return clean(
    await taskQuery(
      client,
      [{ uuid }, { timestamp_from_to: window }, { type }],
      timeoutMs,
    ),
  )
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
