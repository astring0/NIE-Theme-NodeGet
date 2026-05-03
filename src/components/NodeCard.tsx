import { Activity, ArrowDown, ArrowUp, Clock, type LucideIcon } from 'lucide-react'
import { Badge } from './ui/badge'
import { Card } from './ui/card'
import { Flag } from './Flag'
import { StatusDot } from './StatusDot'
import { bytes, pct, relativeAge, uptime } from '../utils/format'
import { cpuLabel, deriveUsage, displayName, distroLogo, osLabel, virtLabel } from '../utils/derive'
import { cn } from '../utils/cn'
import type { HistorySample, Node } from '../types'
import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

const TIMELINE_SLOTS = 44
const SAMPLE_INTERVAL_MS = 2000
const RING_ANIM_MS = 900

export function NodeCard({ node }: { node: Node }) {
  const u = deriveUsage(node)
  const tags = Array.isArray(node.meta?.tags) ? node.meta.tags : []
  const os = osLabel(node)
  const logo = distroLogo(node)
  const virt = virtLabel(node)
  const cpu = cpuLabel(node)
  const timeline = useMemo(
    () => buildTimeline(node.history || [], node.online),
    [node.history, node.online],
  )

  return (
    <a href={`#${encodeURIComponent(node.uuid)}`} className="block h-full">
      <Card
        className={cn(
          'group h-full p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_10px_30px_rgba(66,185,131,0.10)] flex flex-col gap-3',
          !node.online && 'opacity-70',
        )}
      >
        <div className="flex items-center gap-2.5 border-b border-dashed border-border pb-3">
          <StatusDot online={node.online} />
          {logo && (
            <img src={logo} alt="" className="h-6 w-6 shrink-0 rounded-full object-contain" loading="lazy" />
          )}
          <span className="min-w-0 flex-1 truncate text-[15px] font-black tracking-wide text-foreground" title={displayName(node)}>
            {displayName(node)}
          </span>
          <Flag code={node.meta?.region} className="shrink-0" />
        </div>

        {(os || virt) && (
          <div className="truncate text-xs font-bold text-muted-foreground">
            {[os, virt].filter(Boolean).join(' · ')}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 py-1">
          <RingMetric label="CPU" value={u.cpu} sub={cpu || null} subTitle={cpu || undefined} />
          <RingMetric
            label="内存"
            value={u.mem}
            sub={u.memTotal ? `${bytes(u.memUsed)} / ${bytes(u.memTotal)}` : null}
          />
          <RingMetric
            label="磁盘"
            value={u.disk}
            sub={u.diskTotal ? `${bytes(u.diskUsed)} / ${bytes(u.diskTotal)}` : null}
          />
        </div>

        <OnlineTimeline history={timeline} online={node.online} />

        <div className="mt-auto space-y-1.5 border-t border-dashed border-border pt-3 font-mono text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <Stat icon={ArrowDown}>{bytes(u.netIn || 0)}/s</Stat>
            <Stat icon={ArrowUp}>{bytes(u.netOut || 0)}/s</Stat>
          </div>
          <div className="flex items-center gap-3">
            <Stat icon={Clock}>{uptime(u.uptime)}</Stat>
            <span className="ml-auto">{relativeAge(u.ts)}</span>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map(t => (
              <Badge key={t} variant="outline" className="rounded-full border-border bg-secondary px-2 py-0.5 text-[10px] font-extrabold text-muted-foreground hover:border-primary hover:text-primary">
                {t}
              </Badge>
            ))}
          </div>
        )}
      </Card>
    </a>
  )
}

function Stat({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="h-3 w-3" />
      {children}
    </span>
  )
}

function RingMetric({
  label,
  value,
  sub,
  subTitle,
}: {
  label: string
  value: number | undefined
  sub?: string | null
  subTitle?: string
}) {
  const target = clampMetric(value)
  const animated = useAnimatedMetric(target, RING_ANIM_MS)
  const style = {
    '--ring-value': `${animated * 3.6}deg`,
    '--ring-color': metricColor(value),
  } as CSSProperties

  return (
    <div className="min-w-0 text-center" title={subTitle || sub || undefined}>
      <div
        className="nodeget-ring relative mx-auto flex h-[74px] w-[74px] items-center justify-center rounded-full shadow-sm"
        style={style}
        aria-label={`${label} ${pct(value)}`}
      >
        <div className="absolute inset-[7px] rounded-full bg-card" />
        <div
          className="absolute inset-0 rounded-full opacity-70"
          style={{ boxShadow: `0 0 0 1px hsl(var(--border) / 0.75), 0 0 18px ${metricGlow(value)}` }}
        />
        <div className="relative z-[1] flex flex-col items-center leading-none">
          <span className="text-[15px] font-black text-foreground">{Number.isFinite(value) ? pct(animated) : '—'}</span>
          <span className="mt-1 text-[10px] font-extrabold tracking-wide text-muted-foreground">{label}</span>
        </div>
      </div>
      {sub && (
        <div className="mt-2 truncate text-[10px] font-bold leading-snug text-muted-foreground" title={subTitle || sub}>
          {sub}
        </div>
      )}
    </div>
  )
}

function OnlineTimeline({ history, online }: { history: boolean[]; online: boolean }) {
  const onlineCount = history.filter(Boolean).length
  const availability = history.length ? (onlineCount / history.length) * 100 : 0

  return (
    <div className="space-y-1.5 rounded-2xl border border-dashed border-border bg-secondary/35 px-3 py-2.5">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1 font-bold text-muted-foreground">
          <Activity className="h-3.5 w-3.5" />
          <span className={cn('transition-colors', online ? 'text-primary' : 'text-muted-foreground')}>
            {online ? '在线状态' : '离线状态'}
          </span>
        </span>
        <span className="ml-auto font-black text-primary">{availability.toFixed(0)}%</span>
      </div>
      <div className="flex items-end gap-[2px]" aria-label={`近期在线率 ${availability.toFixed(0)}%`}>
        {history.map((active, index) => (
          <span
            key={index}
            className={cn(
              'block h-5 flex-1 rounded-[2px] transition-colors duration-300',
              active
                ? 'bg-primary shadow-[0_0_0_1px_rgba(66,185,131,0.08)]'
                : 'bg-border/85',
            )}
          />
        ))}
      </div>
    </div>
  )
}

function clampMetric(v?: number | null) {
  if (v == null || !Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, v))
}

function easeInOutCubic(progress: number) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2
}

function useAnimatedMetric(target: number, duration = 900) {
  const [value, setValue] = useState(target)
  const currentRef = useRef(target)

  useEffect(() => {
    const from = currentRef.current
    const to = target
    if (Math.abs(from - to) < 0.05) {
      currentRef.current = to
      setValue(to)
      return
    }

    let frame = 0
    let cancelled = false
    const start = performance.now()

    const tick = (now: number) => {
      if (cancelled) return
      const progress = Math.min((now - start) / duration, 1)
      const eased = easeInOutCubic(progress)
      const next = from + (to - from) * eased
      currentRef.current = next
      setValue(next)
      if (progress < 1) frame = requestAnimationFrame(tick)
      else currentRef.current = to
    }

    frame = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [duration, target])

  return value
}

function metricColor(v?: number | null) {
  if (v == null || !Number.isFinite(v)) return 'hsl(var(--muted-foreground) / 0.45)'
  if (v >= 90) return '#f56565'
  if (v >= 70) return '#f6ad55'
  return '#42b983'
}

function metricGlow(v?: number | null) {
  if (v == null || !Number.isFinite(v)) return 'rgba(148, 163, 184, 0.08)'
  if (v >= 90) return 'rgba(245, 101, 101, 0.20)'
  if (v >= 70) return 'rgba(246, 173, 85, 0.18)'
  return 'rgba(66, 185, 131, 0.18)'
}

function buildTimeline(history: HistorySample[], online: boolean, now = Date.now()) {
  const sorted = [...history].sort((a, b) => a.t - b.t)
  const firstSlotStart = now - TIMELINE_SLOTS * SAMPLE_INTERVAL_MS
  let cursor = 0

  return Array.from({ length: TIMELINE_SLOTS }, (_, index) => {
    const slotStart = firstSlotStart + index * SAMPLE_INTERVAL_MS
    const slotEnd = slotStart + SAMPLE_INTERVAL_MS
    let active = false

    while (cursor < sorted.length && sorted[cursor].t < slotStart) cursor++
    let probe = cursor
    while (probe < sorted.length && sorted[probe].t < slotEnd) {
      active = true
      probe++
    }

    if (!active && index === TIMELINE_SLOTS - 1 && online) active = true
    return active
  })
}
