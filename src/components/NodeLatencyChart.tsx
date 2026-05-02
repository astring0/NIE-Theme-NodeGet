import { Activity, AlertCircle, Loader2 } from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useNodeLatency } from '../hooks/useNodeLatency'
import { latencyMs, relativeAge } from '../utils/format'
import type { BackendToken } from '../api/pool'
import type { LatencySample, LatencyTaskType, Node } from '../types'

const TOOLTIP_STYLE = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 6,
  fontSize: 11,
}

const TYPE_LABEL: Record<LatencyTaskType, string> = {
  ping: 'Ping',
  tcp_ping: 'TCP Ping',
  http_ping: 'HTTP Ping',
}

interface Props {
  node: Node
  backend?: BackendToken | null
}

export function NodeLatencyChart({ node, backend }: Props) {
  const { samples, loading, error } = useNodeLatency(backend, node.uuid)
  const latest = samples.at(-1)
  const values = samples.map(s => s.value).filter(Number.isFinite)
  const avg = values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null
  const min = values.length ? Math.min(...values) : null
  const max = values.length ? Math.max(...values) : null
  const gradientId = `latency-${node.uuid.replace(/[^a-z0-9_-]/gi, '')}`

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">延迟</div>
          <div className="mt-1 flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">
              {latest ? `${TYPE_LABEL[latest.type]} · ${latest.target || '未知目标'}` : 'Ping / TCP Ping / HTTP Ping'}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold font-mono leading-none">
            {latest ? latencyMs(latest.value) : '—'}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {latest ? relativeAge(latest.t) : loading ? '读取中…' : '暂无数据'}
          </div>
        </div>
      </div>

      {error && !samples.length ? (
        <div className="h-36 rounded-md border border-dashed flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          <span>延迟数据读取失败：{error}</span>
        </div>
      ) : samples.length ? (
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={samples} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="t"
                minTickGap={26}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={t => new Date(Number(t)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              />
              <YAxis
                width={42}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={v => `${Math.round(Number(v))}`}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={t => new Date(Number(t)).toLocaleString()}
                formatter={(v, _name, item) => {
                  const payload = item.payload as LatencySample
                  const name = `${TYPE_LABEL[payload.type]}${payload.target ? ` · ${payload.target}` : ''}`
                  return [latencyMs(Number(v)), name]
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                name="延迟"
                stroke="hsl(var(--primary))"
                strokeWidth={1.8}
                fill={`url(#${gradientId})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-36 rounded-md border border-dashed flex items-center justify-center text-sm text-muted-foreground">
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

      <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
        <Stat label="最低" value={min} />
        <Stat label="平均" value={avg} />
        <Stat label="最高" value={max} />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-md border bg-card/50 px-3 py-2">
      <div className="text-[11px] text-muted-foreground mb-1">{label}</div>
      <div className="font-mono text-sm">{value == null ? '—' : latencyMs(value)}</div>
    </div>
  )
}
