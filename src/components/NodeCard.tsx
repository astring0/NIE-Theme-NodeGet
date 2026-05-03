import { ArrowDown, ArrowUp, Clock, type LucideIcon } from 'lucide-react'
import { Badge } from './ui/badge'
import { Card } from './ui/card'
import { Flag } from './Flag'
import { StatusDot } from './StatusDot'
import { bytes, pct, relativeAge, uptime } from '../utils/format'
import { cpuLabel, deriveUsage, displayName, distroLogo, osLabel, virtLabel } from '../utils/derive'
import { cn } from '../utils/cn'
import type { Node } from '../types'
import type { CSSProperties, ReactNode } from 'react'

export function NodeCard({ node }: { node: Node }) {
  const u = deriveUsage(node)
  const tags = Array.isArray(node.meta?.tags) ? node.meta.tags : []
  const os = osLabel(node)
  const logo = distroLogo(node)
  const virt = virtLabel(node)
  const cpu = cpuLabel(node)

  return (
    <a href={`#${encodeURIComponent(node.uuid)}`} className="block h-full">
      <Card
        className={cn(
          'group h-full p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_10px_30px_rgba(66,185,131,0.10)] flex flex-col gap-3',
          !node.online && 'opacity-60 grayscale-[0.25]',
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
  const safe = Number.isFinite(value) ? Math.min(100, Math.max(0, value as number)) : 0
  const style = {
    '--ring-value': `${safe * 3.6}deg`,
    '--ring-color': metricColor(value),
  } as CSSProperties

  return (
    <div className="min-w-0 text-center" title={subTitle || sub || undefined}>
      <div
        className="nodeget-ring relative mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full shadow-sm"
        style={style}
        aria-label={`${label} ${pct(value)}`}
      >
        <div className="absolute inset-[7px] rounded-full bg-card" />
        <div className="relative z-[1] flex flex-col items-center leading-none">
          <span className="text-[15px] font-black text-foreground">{pct(value)}</span>
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

function metricColor(v?: number | null) {
  if (v == null || !Number.isFinite(v)) return 'hsl(var(--muted-foreground) / 0.45)'
  if (v >= 90) return '#f56565'
  if (v >= 70) return '#f6ad55'
  return '#42b983'
}
