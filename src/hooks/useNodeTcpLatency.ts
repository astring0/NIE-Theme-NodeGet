import { useEffect, useState } from 'react'
import { fetchLatencyRows } from './useNodeLatency'
import type { BackendPool } from '../api/pool'
import type { TaskQueryResult } from '../types'

const REFRESH_MS = 30_000
const QUERY_TIMEOUT_MS = 20_000
const AVAILABILITY_WINDOW_MS = 4 * 60 * 60 * 1000

export function useNodeTcpLatency(
  pool: BackendPool | null,
  source: string | null,
  uuid: string | null,
) {
  const [tcpData, setTcpData] = useState<TaskQueryResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setTcpData([])
    setError(null)

    if (!pool || !source || !uuid) return
    const entry = pool.entries.find(e => e.name === source)
    if (!entry) return

    let cancelled = false

    const fetchOnce = async () => {
      setLoading(true)

      try {
        const rows = await fetchLatencyRows(entry.client, uuid, 'tcp_ping', QUERY_TIMEOUT_MS, AVAILABILITY_WINDOW_MS)
        if (!cancelled) {
          setTcpData(rows)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) {
          setTcpData([])
          setError(e instanceof Error ? e.message : String(e))
        }
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

  return { tcpData, loading, error }
}
