import { useEffect, useState } from 'react'
import { taskQuery } from '../api/methods'
import type { BackendPool } from '../api/pool'
import type { TaskQueryResult } from '../types'

const WINDOW_MS = 60 * 60 * 1000
const REFRESH_MS = 30_000
const QUERY_TIMEOUT_MS = 15_000

function clean(rows: TaskQueryResult[] | undefined): TaskQueryResult[] {
  return (rows ?? [])
    .filter(r => r.cron_source && r.cron_source !== '未知')
    .sort((a, b) => a.timestamp - b.timestamp)
}

export function useNodeTcpLatency(
  pool: BackendPool | null,
  source: string | null,
  uuid: string | null,
) {
  const [tcpData, setTcpData] = useState<TaskQueryResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setTcpData([])

    if (!pool || !source || !uuid) return
    const entry = pool.entries.find(e => e.name === source)
    if (!entry) return

    let cancelled = false

    const fetchOnce = async () => {
      const now = Date.now()
      const window: [number, number] = [now - WINDOW_MS, now]
      setLoading(true)

      try {
        const rows = await taskQuery(
          entry.client,
          [{ uuid }, { timestamp_from_to: window }, { type: 'tcp_ping' }, { limit: 600 }],
          QUERY_TIMEOUT_MS,
        )
        if (!cancelled) setTcpData(clean(rows))
      } catch {
        if (!cancelled) setTcpData([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchOnce()
    const timer = setInterval(fetchOnce, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [pool, source, uuid])

  return { tcpData, loading }
}
