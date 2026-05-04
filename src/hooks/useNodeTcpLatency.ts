import { useEffect, useState } from 'react'
import { fetchLatencyRows, getLatencyCache, setLatencyCache } from './useNodeLatency'
import type { BackendPool } from '../api/pool'
import type { TaskQueryResult } from '../types'

const REFRESH_MS = 60_000
const QUERY_TIMEOUT_MS = 20_000
const AVAILABILITY_WINDOW_MS = 4 * 60 * 60 * 1000

interface TcpLatencyState {
  key: string
  tcpData: TaskQueryResult[]
  loading: boolean
  error: string | null
  queried: boolean
}

function queryKey(source: string | null, uuid: string | null) {
  return `${source ?? ''}::${uuid ?? ''}`
}

function hasQueryTarget(pool: BackendPool | null, source: string | null, uuid: string | null) {
  return Boolean(pool && source && uuid && pool.entries.some(e => e.name === source))
}

export function useNodeTcpLatency(
  pool: BackendPool | null,
  source: string | null,
  uuid: string | null,
) {
  const currentKey = queryKey(source, uuid)
  const currentCache = getLatencyCache(source, uuid, 'tcp_ping', AVAILABILITY_WINDOW_MS)
  const canQuery = hasQueryTarget(pool, source, uuid)
  const [state, setState] = useState<TcpLatencyState>(() => ({
    key: currentKey,
    tcpData: currentCache,
    loading: canQuery,
    error: null,
    queried: false,
  }))

  useEffect(() => {
    const key = queryKey(source, uuid)
    const cached = getLatencyCache(source, uuid, 'tcp_ping', AVAILABILITY_WINDOW_MS)
    const entry = pool && source ? pool.entries.find(e => e.name === source) : undefined

    setState({
      key,
      tcpData: cached,
      loading: Boolean(pool && source && uuid && entry),
      error: null,
      queried: false,
    })

    if (!pool || !source || !uuid || !entry) return

    let cancelled = false

    const fetchOnce = async () => {
      setState(prev =>
        prev.key === key
          ? { ...prev, loading: !prev.queried }
          : prev,
      )

      try {
        const rows = await fetchLatencyRows(entry.client, uuid, 'tcp_ping', QUERY_TIMEOUT_MS, AVAILABILITY_WINDOW_MS)
        if (!cancelled) {
          setLatencyCache(source, uuid, 'tcp_ping', rows)
          setState({
            key,
            tcpData: getLatencyCache(source, uuid, 'tcp_ping', AVAILABILITY_WINDOW_MS),
            loading: false,
            error: null,
            queried: true,
          })
        }
      } catch (e) {
        if (!cancelled) {
          setState({
            key,
            tcpData: getLatencyCache(source, uuid, 'tcp_ping', AVAILABILITY_WINDOW_MS),
            loading: false,
            error: e instanceof Error ? e.message : String(e),
            queried: true,
          })
        }
      }
    }

    fetchOnce()
    const timer = setInterval(fetchOnce, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [pool, source, uuid])

  const stateMatchesCurrentQuery = state.key === currentKey

  return {
    tcpData: stateMatchesCurrentQuery ? state.tcpData : currentCache,
    loading: canQuery && (stateMatchesCurrentQuery ? state.loading || !state.queried : true),
    error: stateMatchesCurrentQuery ? state.error : null,
  }
}
