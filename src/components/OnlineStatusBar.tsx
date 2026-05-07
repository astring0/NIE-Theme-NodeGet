import { Activity } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'
import { cn } from '../utils/cn'
import { bytes, pct } from '../utils/format'
import type { HistorySample } from '../types'

interface OnlineStatusBarProps {
  history: HistorySample[]
  online: boolean
  compact?: boolean
  intervalMinutes?: number
  slots?: number
  title?: string
  mobileHalf?: boolean
  serverHistory?: HistorySample[]
  loading?: boolean
}

interface TimelineSlot {
  active: boolean
  start: number
  end: number
  sample: HistorySample | null
  reason: 'resource' | 'probe' | 'merged' | 'empty'
}

function hasResourceSignal(sample: HistorySample | null | undefined) {
  if (!sample) return false
  return (
    sample.cpu != null ||
    sample.mem != null ||
    sample.disk != null ||
    (sample.netIn ?? 0) > 0 ||
    (sample.netOut ?? 0) > 0
  )
}

function isSampleEmpty(sample: HistorySample | null) {
  return !hasResourceSignal(sample)
}

function mergeSamples(primary: HistorySample | null, fallback: HistorySample | null) {
  if (!primary && !fallback) return null
  if (!primary) return fallback
  if (!fallback) return primary
  return {
    t: primary.t || fallback.t,
    cpu: primary.cpu ?? fallback.cpu ?? null,
    mem: primary.mem ?? fallback.mem ?? null,
    disk: primary.disk ?? fallback.disk ?? null,
    netIn: primary.netIn ?? fallback.netIn ?? 0,
    netOut: primary.netOut ?? fallback.netOut ?? 0,
  }
}

export function OnlineStatusBar({
  history,
  online,
  compact = false,
  intervalMinutes = 3,
  slots = 80,
  title = '在线状态',
  mobileHalf = true,
  serverHistory,
  loading = false,
}: OnlineStatusBarProps) {
  const isMobile = useIsMobile()
  const effectiveSlots = mobileHalf && isMobile ? Math.max(1, Math.floor(slots / 2)) : slots
  const resourceHistory = history || []
  const tcpHistory = serverHistory || []
  const pendingRemoteHistory = loading && tcpHistory.length === 0
  const timeline = useMemo(
    () =>
      pendingRemoteHistory
        ? buildEmptyTimeline(intervalMinutes, effectiveSlots)
        : buildAvailabilityTimeline(resourceHistory, tcpHistory, online, intervalMinutes, effectiveSlots),
    [resourceHistory, tcpHistory, online, intervalMinutes, effectiveSlots, pendingRemoteHistory],
  )
  const activeCount = timeline.filter(item => item.active).length
  const availability = timeline.length ? (activeCount / timeline.length) * 100 : 0
  const [hovered, setHovered] = useState<number | null>(null)
  const activeSlot = hovered != null ? timeline[hovered] : null
  const activeLeft = hovered != null ? `${((hovered + 0.5) / timeline.length) * 100}%` : '50%'

  return (
    <div
      className={cn(
        'rounded-md border border-dashed border-border bg-secondary/35',
        compact ? 'px-3 py-2.5' : 'px-5 py-4',
      )}
    >
      <div className={cn('flex items-center gap-2', compact ? 'text-[11px]' : 'text-sm')}>
        <span className="inline-flex items-center gap-1.5 font-bold text-primary">
          <Activity className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
          {title}
        </span>
        <span className={cn('ml-auto font-black text-primary', compact ? 'text-[12px]' : 'text-base')}>
          {pendingRemoteHistory ? '…' : `${availability.toFixed(0)}%`}
        </span>
      </div>

      <div
        className="relative mt-2"
        aria-label={`近期在线率 ${pendingRemoteHistory ? '读取中' : `${availability.toFixed(0)}%`}`}
        onMouseLeave={() => setHovered(null)}
      >
        {activeSlot && !pendingRemoteHistory && (
          <StatusTooltip compact={compact} slot={activeSlot} left={activeLeft} />
        )}

        <div
          className={cn('grid items-stretch', compact ? 'gap-[3px]' : 'gap-1')}
          style={{ gridTemplateColumns: `repeat(${timeline.length}, minmax(0, 1fr))` }}
        >
          {timeline.map((slot, index) => (
            <span
              key={index}
              className={cn(
                'block cursor-default border border-transparent transition-colors duration-200',
                compact ? 'h-7 sm:h-7' : 'h-8 sm:h-8',
                slot.active
                  ? slot.reason === 'probe'
                    ? 'bg-emerald-400/90 shadow-[0_0_0_1px_rgba(16,185,129,0.10)]'
                    : 'bg-primary shadow-[0_0_0_1px_rgba(66,185,131,0.09)]'
                  : 'bg-border/90',
              )}
              style={{ borderRadius: 2 }}
              title={pendingRemoteHistory ? '读取在线状态…' : buildTitle(slot)}
              onMouseEnter={() => setHovered(index)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function StatusTooltip({ compact, slot, left }: { compact: boolean; slot: TimelineSlot; left: string }) {
  const s = slot.sample
  const timeLabel = formatTime(s?.t ?? slot.end)
  const hasMetrics = hasResourceSignal(s)
  const note =
    slot.reason === 'probe' && !hasMetrics
      ? '该格仅代表在线探测成功，未采集到 CPU / 内存 / 磁盘 数据。'
      : slot.reason === 'merged'
        ? '该格在线；资源值取自相近时段的最近一次采样。'
        : null

  return (
    <div
      className={cn(
        'pointer-events-none absolute bottom-full z-20 mb-3 -translate-x-1/2 rounded-sm border border-[hsl(var(--border))] bg-card px-3 py-2.5 text-left shadow-[0_18px_40px_rgba(15,23,42,0.16)] ring-1 ring-black/5',
        compact ? 'w-[190px] text-[10px]' : 'w-[220px] text-[11px]',
      )}
      style={{ left, backdropFilter: 'none', opacity: 1 }}
    >
      <div className="font-mono text-muted-foreground">{timeLabel}</div>
      <div className={cn('mt-0.5 flex items-center gap-1 font-semibold', slot.active ? 'text-primary' : 'text-rose-500')}>
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
        {slot.active ? '在线' : '离线'}
        {slot.reason === 'probe' && slot.active && <span className="text-[10px] text-muted-foreground">（探测）</span>}
      </div>
      <div className="mt-1.5 space-y-0.5 text-foreground">
        <div>CPU {pct(s?.cpu)}</div>
        <div>内存 {pct(s?.mem)}</div>
        <div>磁盘 {pct(s?.disk)}</div>
        <div>↓ {bytes(s?.netIn ?? 0)}/s · ↑ {bytes(s?.netOut ?? 0)}/s</div>
      </div>
      {note && <div className="mt-2 text-[10px] leading-4 text-muted-foreground">{note}</div>}
    </div>
  )
}

function buildTitle(slot: TimelineSlot) {
  const s = slot.sample
  return [
    formatTime(s?.t ?? slot.end),
    slot.active ? '在线' : '离线',
    slot.reason === 'probe' ? '来源：在线探测' : '来源：资源采样',
    `CPU ${pct(s?.cpu)}`,
    `内存 ${pct(s?.mem)}`,
    `磁盘 ${pct(s?.disk)}`,
    `↓ ${bytes(s?.netIn ?? 0)}/s · ↑ ${bytes(s?.netOut ?? 0)}/s`,
  ].join('\n')
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
}

function buildEmptyTimeline(intervalMinutes = 3, slots = 80, now = Date.now()): TimelineSlot[] {
  const intervalMs = intervalMinutes * 60 * 1000
  const windowEnd = Math.ceil(now / intervalMs) * intervalMs
  const windowStart = windowEnd - slots * intervalMs
  return Array.from({ length: slots }, (_, index) => {
    const start = windowStart + index * intervalMs
    return { active: false, start, end: start + intervalMs, sample: null, reason: 'empty' }
  })
}

function lastSampleInWindow(sorted: HistorySample[], slotStart: number, slotEnd: number) {
  let sample: HistorySample | null = null
  for (const item of sorted) {
    if (item.t < slotStart) continue
    if (item.t >= slotEnd) break
    sample = item
  }
  return sample
}

function nearestSampleBeforeWithin(sorted: HistorySample[], slotEnd: number, maxAgeMs: number) {
  for (let i = sorted.length - 1; i >= 0; i--) {
    const item = sorted[i]
    if (item.t > slotEnd) continue
    if (slotEnd - item.t > maxAgeMs) return null
    return item
  }
  return null
}

export function buildAvailabilityTimeline(
  resourceHistory: HistorySample[],
  tcpHistory: HistorySample[] = [],
  online: boolean,
  intervalMinutes = 3,
  slots = 80,
  now = Date.now(),
): TimelineSlot[] {
  const intervalMs = intervalMinutes * 60 * 1000
  const resources = [...resourceHistory].sort((a, b) => a.t - b.t)
  const tcp = [...tcpHistory].sort((a, b) => a.t - b.t)
  const windowEnd = Math.ceil(now / intervalMs) * intervalMs
  const windowStart = windowEnd - slots * intervalMs
  const latestResource = resources.at(-1) ?? null
  const hasRemoteHistory = tcp.length > 0

  return Array.from({ length: slots }, (_, index) => {
    const slotStart = windowStart + index * intervalMs
    const slotEnd = slotStart + intervalMs
    const resourceInSlot = lastSampleInWindow(resources, slotStart, slotEnd)
    const tcpInSlot = lastSampleInWindow(tcp, slotStart, slotEnd)
    const nearbyResource = nearestSampleBeforeWithin(resources, slotEnd, intervalMs * 2)

    let active = false
    let sample: HistorySample | null = null
    let reason: TimelineSlot['reason'] = 'empty'

    if (hasRemoteHistory) {
      active = Boolean(tcpInSlot)
      if (active) {
        sample = resourceInSlot || mergeSamples(tcpInSlot, nearbyResource)
        reason = resourceInSlot
          ? 'resource'
          : nearbyResource && hasResourceSignal(nearbyResource)
            ? 'merged'
            : 'probe'
      }

      if (!active && index === slots - 1 && online && hasResourceSignal(latestResource)) {
        active = true
        sample = latestResource
        reason = 'resource'
      }
    } else {
      active = Boolean(resourceInSlot && hasResourceSignal(resourceInSlot))
      sample = active ? resourceInSlot : null
      reason = active ? 'resource' : 'empty'

      if (!active && index === slots - 1 && online && hasResourceSignal(latestResource)) {
        active = true
        sample = latestResource
        reason = 'resource'
      }
    }

    if (active && isSampleEmpty(sample) && nearbyResource && hasResourceSignal(nearbyResource)) {
      sample = mergeSamples(sample, nearbyResource)
      reason = reason === 'probe' ? 'merged' : reason
    }

    return { active, start: slotStart, end: slotEnd, sample, reason }
  })
}
