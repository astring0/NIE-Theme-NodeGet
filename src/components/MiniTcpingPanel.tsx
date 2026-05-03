import { Activity } from 'lucide-react'
import { useMemo } from 'react'
import { useNodeTcpLatency } from '../hooks/useNodeTcpLatency'
import { cn } from '../utils/cn'
import type { BackendPool } from '../api/pool'
import type { Node, TaskQueryResult } from '../types'

const SEGMENTS = 44
const NAME_ORDER = ['电信', '联通', '移动']

interface Props {
  node: Node
  pool: BackendPool | null
}

interface SeriesSummary {
  name: string
  label: string
  values: (number | null)[]
  avg: number | null
  jitter: number | null
  lossRate: number
}

export function MiniTcpingPanel({ node, pool }: Props) {
  const { tcpData, loading } = useNodeTcpLatency(pool, node.source, node.uuid)
  const series = useMemo(() => summarizeTcping(tcpData), [tcpData])

  return (
    <div className="hidden md:block rounded-[20px] border border-dashed border-border bg-secondary/30 px-3 py-2.5">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-black text-muted-foreground">
        <Activity className="h-3.5 w-3.5 text-primary" />
        <span>三网 TCPing</span>
        {loading && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />}
      </div>

      {series.length > 0 ? (
        <div className="space-y-1.5">
          {series.slice(0, 3).map(item => (
            <TcpingRow key={item.name} item={item} />
          ))}
        </div>
      ) : (
        <div className="flex h-[76px] items-center justify-center rounded-xl border border-dashed border-border/80 text-[11px] font-bold text-muted-foreground">
          {loading ? '读取 TCPing…' : '暂无 TCPing 数据'}
        </div>
      )}
    </div>
  )
}

function TcpingRow({ item }: { item: SeriesSummary }) {
  return (
    <div className="grid grid-cols-[52px_minmax(0,1fr)_52px] items-center gap-2 text-[10px]">
      <div className="truncate font-black text-muted-foreground" title={item.name}>{item.label}</div>
      <div className="flex h-4 items-stretch gap-[1px] overflow-hidden rounded-sm bg-border/60 px-[1px] py-[1px]">
        {item.values.map((v, i) => (
          <span
            key={i}
            className="block flex-1 rounded-[1px]"
            style={{ backgroundColor: segmentColor(v) }}
            title={`${item.label} ${v == null ? '丢包' : `${v.toFixed(1)} ms`}`}
          />
        ))}
      </div>
      <div className="text-right font-mono leading-tight">
        <div className="font-black text-foreground/85">{item.avg == null ? '—' : `${item.avg.toFixed(0)}ms`}</div>
        <div className={cn('text-[9px]', item.lossRate >= 10 ? 'text-rose-500' : 'text-muted-foreground')}>
          {item.lossRate.toFixed(0)}%
        </div>
      </div>
    </div>
  )
}

function summarizeTcping(rows: TaskQueryResult[]): SeriesSummary[] {
  const groups = new Map<string, TaskQueryResult[]>()
  for (const row of rows) {
    const name = row.cron_source || '未知'
    if (!groups.has(name)) groups.set(name, [])
    groups.get(name)!.push(row)
  }

  return [...groups.entries()]
    .map(([name, list]) => {
      const values = list.slice(-SEGMENTS).map(row => pickTcpValue(row))
      while (values.length < SEGMENTS) values.unshift(null)
      const valid = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      const avg = valid.length ? valid.reduce((sum, v) => sum + v, 0) / valid.length : null
      const jitter = valid.length > 1
        ? valid.slice(1).reduce((sum, v, i) => sum + Math.abs(v - valid[i]), 0) / (valid.length - 1)
        : null
      const lossRate = values.length ? ((values.length - valid.length) / values.length) * 100 : 0
      return {
        name,
        label: displayProvider(name),
        values,
        avg,
        jitter,
        lossRate,
      }
    })
    .sort((a, b) => providerRank(a.name) - providerRank(b.name) || (a.avg ?? Infinity) - (b.avg ?? Infinity))
}

function pickTcpValue(row: TaskQueryResult) {
  const v = row.task_event_result?.tcp_ping
  return row.success && typeof v === 'number' && Number.isFinite(v) ? v : null
}

function displayProvider(name: string) {
  const cleaned = name
    .replace(/^tcping[-_]?/i, '')
    .replace(/^tcp[-_]?ping[-_]?/i, '')
    .replace(/^ping[-_]?/i, '')
    .replace(/[\s_-]+$/g, '')
  if (cleaned.includes('电信')) return '电信'
  if (cleaned.includes('联通')) return '联通'
  if (cleaned.includes('移动')) return '移动'
  return cleaned || name
}

function providerRank(name: string) {
  const label = displayProvider(name)
  const idx = NAME_ORDER.findIndex(k => label.includes(k))
  return idx === -1 ? 99 : idx
}

function segmentColor(v: number | null) {
  if (v == null) return '#f43f5e'
  if (v <= 80) return '#42b983'
  if (v <= 160) return '#facc15'
  if (v <= 260) return '#fb923c'
  return '#ef4444'
}
