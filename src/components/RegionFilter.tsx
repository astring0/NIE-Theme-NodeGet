import { cn } from '../utils/cn'
import { Flag } from './Flag'
import type { ReactNode } from 'react'

interface Props {
  regions: { code: string; count: number }[]
  total: number
  active: string | null
  onChange: (code: string | null) => void
}

export function RegionFilter({ regions, total, active, onChange }: Props) {
  if (regions.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip selected={active === null} onClick={() => onChange(null)}>
        <span>全部</span>
        <span className="text-[10px] opacity-70">{total}</span>
      </Chip>
      {regions.map(r => (
        <Chip key={r.code} selected={active === r.code} onClick={() => onChange(r.code)}>
          <Flag code={r.code} className="w-4 h-3" />
          <span>{r.code}</span>
          <span className="text-[10px] opacity-70">{r.count}</span>
        </Chip>
      ))}
    </div>
  )
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-extrabold transition-all duration-200',
        selected
          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
          : 'border-border bg-secondary text-muted-foreground hover:border-primary hover:bg-primary hover:text-primary-foreground',
      )}
    >
      {children}
    </button>
  )
}
