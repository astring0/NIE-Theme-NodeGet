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
  // 历史在线状态优先使用后端真实任务结果，避免前端同秒轮询导致所有机器出现一样的格子图。
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
        'rounded-md border border-dashed border-border bg-secondary/40',
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
        className={cn('relative mt-2 flex items-end', compact ? 'gap-[2px]' : 'gap-[3px]')}
        aria-label={`近期在线率 ${pendingRemoteHistory ? '读取中' : `${availability.toFixed(0)}%`}`}
        onMouseLeave={() => setHovered(null)}
      >
        {activeSlot && !pendingRemoteHistory && (
          <StatusTooltip compact={compact} slot={activeSlot} left={activeLeft} />
        )}
        {timeline.map((slot, index) => (
          <span
            key={index}
            className={cn(
              'block flex-1 cursor-default transition-colors duration-200',
              compact ? 'h-7 sm:h-7' : 'h-8 sm:h-8',
              slot.active
                ? 'bg-primary shadow-[0_0_0_1px_rgba(66,185,131,0.09)]'
                : 'bg-border/90',
            )}
            style={{ borderRadius: 1 }}
            title={pendingRemoteHistory ? '读取在线状态…' : buildTitle(slot)}
            onMouseEnter={() => setHovered(index)}
          />
        ))}
      </div>
    </div>
  )
}

function StatusTooltip({
  compact,
  slot,
  left,
}: {
  compact: boolean
  slot: TimelineSlot
  left: string
}) {
  const s = slot.sample
  const timeLabel = formatTime(s?.t ?? slot.end)

  return (
    <div
      className={cn(
        'pointer-events-none absolute bottom-full z-20 mb-3 -translate-x-1/2 rounded-sm border border-[hsl(var(--border))] bg-card px-3 py-2.5 text-left shadow-[0_18px_40px_rgba(15,23,42,0.16)] ring-1 ring-black/5',
        compact ? 'w-[168px] text-[10px]' : 'w-[188px] text-[11px]',
      )}
      style={{ left, backdropFilter: 'none', opacity: 1 }}
    >
      <div className="font-mono text-muted-foreground">{timeLabel}</div>
      <div className={cn('mt-0.5 flex items-center gap-1 font-semibold', slot.active ? 'text-primary' : 'text-rose-500')}>
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
        {slot.active ? '在线' : '离线'}
      </div>
      <div className="mt-1.5 space-y-0.5 text-foreground">
        <div>CPU {pct(s?.cpu)}</div>
        <div>内存 {pct(s?.mem)}</div>
        <div>磁盘 {pct(s?.disk)}</div>
        <div>↓ {bytes(s?.netIn ?? 0)}/s · ↑ {bytes(s?.netOut ?? 0)}/s</div>
      </div>
    </div>
  )
}

function buildTitle(slot: TimelineSlot) {
  const s = slot.sample
  return [
    formatTime(s?.t ?? slot.end),
    slot.active ? '在线' : '离线',
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
    return { active: false, start, end: start + intervalMs, sample: null }
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

function nearestSampleBefore(sorted: HistorySample[], slotEnd: number) {
  for (let i = sorted.length - 1; i >= 0; i--) {
    const item = sorted[i]
    if (item.t <= slotEnd) return item
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
    const resourceBefore = nearestSampleBefore(resources, slotEnd)

    let active = false
    let sample: HistorySample | null = null

    if (hasRemoteHistory) {
      // 有后端任务历史时，只按真实任务结果绘制历史格子；当前格子允许用实时资源状态兜底。
      active = Boolean(tcpInSlot)
      sample = active ? mergeSamples(tcpInSlot, resourceBefore) : null

      if (!active && index === slots - 1 && online && hasResourceSignal(latestResource)) {
        active = true
        sample = latestResource
      }
    } else {
      // 没有后端历史时，退回到当前会话真实资源采样。
      active = hasResourceSignal(resourceInSlot)
      sample = active ? resourceInSlot : null

      if (!active && index === slots - 1 && online && hasResourceSignal(latestResource)) {
        active = true
        sample = latestResource
      }
    }

    if (active && isSampleEmpty(sample)) sample = mergeSamples(sample, resourceBefore)

    return { active, start: slotStart, end: slotEnd, sample }
  })
}
