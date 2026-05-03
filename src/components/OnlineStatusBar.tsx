import { Activity } from 'lucide-react'
import { cn } from '../utils/cn'
import type { HistorySample } from '../types'

interface OnlineStatusBarProps {
  history: HistorySample[]
  online: boolean
  compact?: boolean
  intervalMinutes?: number
  slots?: number
  title?: string
  subtitle?: string
}

export function OnlineStatusBar({
  history,
  online,
  compact = false,
  intervalMinutes = 3,
  slots = compact ? 32 : 48,
  title = '在线状态',
  subtitle,
}: OnlineStatusBarProps) {
  const timeline = buildAvailabilityTimeline(history, online, intervalMinutes, slots)
  const activeCount = timeline.filter(Boolean).length
  const availability = timeline.length ? (activeCount / timeline.length) * 100 : 0

  return (
    <div
      className={cn(
        'rounded-[22px] border border-dashed border-border bg-secondary/35',
        compact ? 'px-3 py-2.5' : 'px-5 py-4',
      )}
    >
      <div className={cn('flex items-center gap-2', compact ? 'text-[11px]' : 'text-sm')}>
        <span className="inline-flex items-center gap-1.5 font-bold text-primary">
          <Activity className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
          {title}
        </span>
        {subtitle && (
          <span className="text-muted-foreground">
            {subtitle}
          </span>
        )}
        <span className={cn('ml-auto font-black text-primary', compact ? 'text-[12px]' : 'text-base')}>
          {availability.toFixed(0)}%
        </span>
      </div>

      <div className={cn('mt-2 flex items-end', compact ? 'gap-[3px]' : 'gap-[4px]')} aria-label={`近期在线率 ${availability.toFixed(0)}%`}>
        {timeline.map((active, index) => (
          <span
            key={index}
            className={cn(
              'block flex-1 rounded-full transition-all duration-300',
              compact ? 'h-6' : 'h-8',
              active
                ? 'bg-primary shadow-[0_0_0_1px_rgba(66,185,131,0.09)]'
                : 'bg-border/90',
            )}
            title={`${intervalMinutes} 分钟窗口 ${index + 1}/${timeline.length}`}
          />
        ))}
      </div>
    </div>
  )
}

export function buildAvailabilityTimeline(
  history: HistorySample[],
  online: boolean,
  intervalMinutes = 3,
  slots = 48,
  now = Date.now(),
) {
  const intervalMs = intervalMinutes * 60 * 1000
  const sorted = [...history].sort((a, b) => a.t - b.t)
  const windowStart = now - slots * intervalMs
  let cursor = 0

  return Array.from({ length: slots }, (_, index) => {
    const slotStart = windowStart + index * intervalMs
    const slotEnd = slotStart + intervalMs
    let active = false

    while (cursor < sorted.length && sorted[cursor].t < slotStart) cursor++

    let probe = cursor
    while (probe < sorted.length && sorted[probe].t < slotEnd) {
      active = true
      probe++
    }

    if (!active && index === slots - 1 && online) active = true
    return active
  })
}
