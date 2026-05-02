import { useCallback, useEffect, useState } from 'react'
import { RpcClient } from '../api/client'
import { latencyTaskQuery } from '../api/methods'
import type { BackendToken } from '../api/pool'
import type { LatencySample, LatencyTaskType, TaskQueryRow } from '../types'

const LATENCY_TYPES: LatencyTaskType[] = ['ping', 'tcp_ping', 'http_ping']
const LIMIT_PER_TYPE = 40
const REFRESH_MS = 30_000

interface LatencyState {
  samples: LatencySample[]
  loading: boolean
  error: string | null
}

function latencyTypeOf(row: TaskQueryRow, fallback: LatencyTaskType): LatencyTaskType {
  for (const type of LATENCY_TYPES) {
    if (typeof row.task_event_result?.[type] === 'number') return type
  }
  return fallback
}

function toLatencySample(row: TaskQueryRow, fallback: LatencyTaskType): LatencySample | null {
  const type = latencyTypeOf(row, fallback)
  const value = row.task_event_result?.[type]
  const timestamp = Number(row.timestamp)

  if (!Number.isFinite(value) || !Number.isFinite(timestamp)) return null

  const rawTarget = row.task_event_type?.[type]
  return {
    id: `${row.task_id ?? `${type}-${timestamp}`}`,
    t: timestamp,
    value,
    type,
    target: typeof rawTarget === 'string' ? rawTarget : '',
    cron: row.cron_source ?? null,
  }
}

function uniqueAndSort(samples: LatencySample[]) {
  const byKey = new Map<string, LatencySample>()
  for (const sample of samples) {
    byKey.set(`${sample.type}-${sample.t}-${sample.value}-${sample.target}`, sample)
  }
  return [...byKey.values()].sort((a, b) => a.t - b.t).slice(-120)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function useNodeLatency(backend: BackendToken | null | undefined, uuid: string | null | undefined) {
  const [state, setState] = useState<LatencyState>({ samples: [], loading: false, error: null })

  const load = useCallback(
    async (client: RpcClient, cancelled: () => boolean) => {
      if (!uuid) return
      setState(prev => ({ ...prev, loading: true, error: null }))

      const settled = await Promise.allSettled(
        LATENCY_TYPES.map(async type => {
          const rows = await latencyTaskQuery(client, uuid, type, LIMIT_PER_TYPE)
          return (rows || []).map(row => toLatencySample(row, type)).filter(Boolean) as LatencySample[]
        }),
      )

      if (cancelled()) return

      const samples = uniqueAndSort(
        settled.flatMap(result => (result.status === 'fulfilled' ? result.value : [])),
      )
      const failures = settled.filter(result => result.status === 'rejected') as PromiseRejectedResult[]
      const error = failures.length === LATENCY_TYPES.length
        ? failures.map(result => errorMessage(result.reason)).join('；')
        : null

      setState({ samples, loading: false, error })
    },
    [uuid],
  )

  useEffect(() => {
    if (!backend || !uuid) {
      setState({ samples: [], loading: false, error: null })
      return
    }

    let stopped = false
    const client = new RpcClient(backend.backend_url, backend.token)
    const cancelled = () => stopped
    const refresh = () => {
      load(client, cancelled).catch(error => {
        if (!stopped) setState({ samples: [], loading: false, error: errorMessage(error) })
      })
    }

    refresh()
    const timer = window.setInterval(refresh, REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      stopped = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      client.close()
    }
  }, [backend, load, uuid])

  return state
}
