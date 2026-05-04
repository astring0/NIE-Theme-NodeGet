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
  subtitle?: string
  mobileHalf?: boolean
}

interface TimelineSlot {
  active: boolean
  start: number
  end: number
  sample: HistorySample | null
}

export function OnlineStatusBar({
  history,
  online,
  compact = false,
  intervalMinutes = 3,
  slots = 80,
  title = '在线状态',
  subtitle,
  mobileHalf = true,
}: OnlineStatusBarProps) {
  const isMobile = useIsMobile()
  const effectiveSlots = mobileHalf && isMobile ? Math.max(1, Math.floor(slots / 2)) : slots
  const timeline = useMemo(
    () => buildAvailabilityTimeline(history, online, intervalMinutes, effectiveSlots),
    [history, online, intervalMinutes, effectiveSlots],
  )
  const activeCount = timeline.filter(item => item.active).length
  const availability = timeline.length ? (activeCount / timeline.length) * 100 : 0
  const [hovered, setHovered] = useState<number | null>(null)
  const activeSlot = hovered != null ? timeline[hovered] : null
  const activeLeft = hovered != null ? `${((hovered + 0.5) / timeline.length) * 100}%` : '50%'

  return (
    <div
      className={cn(
        'rounded-[22px] border border-dashed border-border bg-secondary/40',
        compact ? 'px-3 py-2.5' : 'px-5 py-4',
      )}
    >
      <div className={cn('flex items-center gap-2', compact ? 'text-[11px]' : 'text-sm')}>
        <span className="inline-flex items-center gap-1.5 font-bold text-primary">
          <Activity className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
          {title}
        </span>
        {subtitle && <span className="text-muted-foreground">{subtitle}</span>}
        <span className={cn('ml-auto font-black text-primary', compact ? 'text-[12px]' : 'text-base')}>
          {availability.toFixed(0)}%
        </span>
      </div>

      <div
        className={cn('relative mt-2 flex items-end', compact ? 'gap-[2px]' : 'gap-[3px]')}
        aria-label={`近期在线率 ${availability.toFixed(0)}%`}
        onMouseLeave={() => setHovered(null)}
      >
        {activeSlot && (
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
            title={buildTitle(slot)}
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
        'pointer-events-none absolute bottom-full z-20 mb-3 -translate-x-1/2 rounded-xl border border-[hsl(var(--border))] bg-card px-3 py-2.5 text-left shadow-[0_18px_40px_rgba(15,23,42,0.16)] ring-1 ring-black/5',
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

export function buildAvailabilityTimeline(
  history: HistorySample[],
  online: boolean,
  intervalMinutes = 3,
  slots = 80,
  now = Date.now(),
): TimelineSlot[] {
  const intervalMs = intervalMinutes * 60 * 1000
  const sorted = [...history].sort((a, b) => a.t - b.t)
  const windowEnd = Math.ceil(now / intervalMs) * intervalMs
  const windowStart = windowEnd - slots * intervalMs
  let cursor = 0

  return Array.from({ length: slots }, (_, index) => {
    const slotStart = windowStart + index * intervalMs
    const slotEnd = slotStart + intervalMs
    let active = false
    let lastSample: HistorySample | null = null

    while (cursor < sorted.length && sorted[cursor].t < slotStart) cursor++

    let probe = cursor
    while (probe < sorted.length && sorted[probe].t < slotEnd) {
      active = true
      lastSample = sorted[probe]
      probe++
    }

    if (!active && index === slots - 1 && online && sorted.length) {
      active = true
      lastSample = sorted.at(-1) ?? null
    }

    return {
      active,
      start: slotStart,
      end: slotEnd,
      sample: lastSample,
    }
  })
}
