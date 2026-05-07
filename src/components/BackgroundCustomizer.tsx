import { Paintbrush, RotateCcw } from 'lucide-react'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'
import { cn } from '../utils/cn'
import type { BackgroundPattern, BackgroundSettings } from '../types'

interface Props {
  settings: BackgroundSettings
  onChange: (settings: BackgroundSettings) => void
  className?: string
}

const DEFAULT_SETTINGS: BackgroundSettings = {
  pattern: 'grid',
  baseColor: '#f5f8fb',
  accentColor: '#b7c4d6',
  density: 22,
  opacity: 0.09,
}

const PALETTES: { label: string; baseColor: string; accentColor: string }[] = [
  { label: '云白', baseColor: '#f5f8fb', accentColor: '#b7c4d6' },
  { label: '薄荷', baseColor: '#f2fbf6', accentColor: '#34d399' },
  { label: '海盐蓝', baseColor: '#f2f7ff', accentColor: '#60a5fa' },
  { label: '紫雾', baseColor: '#f7f3ff', accentColor: '#a78bfa' },
  { label: '蜜桃', baseColor: '#fff7ed', accentColor: '#fb923c' },
  { label: '玫瑰', baseColor: '#fff1f2', accentColor: '#fb7185' },
  { label: '奶油黄', baseColor: '#fffbea', accentColor: '#facc15' },
  { label: '曜石', baseColor: '#111827', accentColor: '#94a3b8' },
  { label: '深海', baseColor: '#0f172a', accentColor: '#38bdf8' },
  { label: '森林', baseColor: '#102019', accentColor: '#4ade80' },
]

const PATTERNS: { value: BackgroundPattern; label: string }[] = [
  { value: 'grid', label: '网格' },
  { value: 'solid', label: '纯色' },
  { value: 'dots', label: '点状' },
]

export function BackgroundCustomizer({ settings, onChange, className }: Props) {
  const activePalette = PALETTES.find(
    item => item.baseColor === settings.baseColor && item.accentColor === settings.accentColor,
  )?.label

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className={className} aria-label="背景设置">
          <Paintbrush className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>背景样式</DialogTitle>
          <DialogDescription>
            当前访客本地生效，保存在浏览器里，不影响别人看到的页面。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-lg border border-dashed border-border p-4">
            <div className="mb-3 flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
              <span>预览</span>
              <span className="normal-case tracking-normal">{activePalette || '预设色'}</span>
            </div>
            <div className="h-28 rounded-md border border-border" style={previewStyle(settings)} />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold">样式</div>
            <div className="grid grid-cols-3 gap-2">
              {PATTERNS.map(item => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => onChange({ ...settings, pattern: item.value })}
                  className={cn(
                    'rounded-md border px-3 py-2 text-sm font-semibold transition-colors',
                    settings.pattern === item.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card hover:bg-secondary',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold">颜色</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {PALETTES.map(item => {
                const active = item.baseColor === settings.baseColor && item.accentColor === settings.accentColor
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => onChange({ ...settings, baseColor: item.baseColor, accentColor: item.accentColor })}
                    className={cn(
                      'rounded-md border p-2 text-left transition-colors hover:bg-secondary',
                      active ? 'border-primary bg-primary/10' : 'border-border bg-card',
                    )}
                  >
                    <span className="mb-2 flex h-9 overflow-hidden rounded-sm border border-border">
                      <span className="flex-1" style={{ backgroundColor: item.baseColor }} />
                      <span className="w-7" style={{ backgroundColor: item.accentColor }} />
                    </span>
                    <span className={cn('block text-xs font-semibold', active && 'text-primary')}>{item.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <RangeField
            label="纹理密度"
            value={settings.density}
            min={12}
            max={48}
            step={1}
            onChange={value => onChange({ ...settings, density: value })}
          />
          <RangeField
            label="纹理强度"
            value={Math.round(settings.opacity * 100)}
            min={2}
            max={24}
            step={1}
            suffix="%"
            onChange={value => onChange({ ...settings, opacity: value / 100 })}
          />

          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => onChange(DEFAULT_SETTINGS)}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> 恢复默认
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  suffix = '',
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="block space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm font-semibold">
        <span>{label}</span>
        <span className="font-mono text-muted-foreground">{value}{suffix}</span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full"
      />
    </label>
  )
}

function hexToRgba(hex: string, alpha: number) {
  const raw = hex.replace('#', '')
  const full = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return `rgba(148,163,184,${alpha})`
  const n = Number.parseInt(full, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function previewStyle(settings: BackgroundSettings) {
  const density = settings.density || 22
  const opacity = settings.opacity || 0.09
  const patternColor = hexToRgba(settings.accentColor, opacity)
  let backgroundImage = 'none'
  let backgroundSize = 'auto'

  if (settings.pattern === 'grid') {
    backgroundImage = `linear-gradient(${patternColor} 1px, transparent 1px), linear-gradient(90deg, ${patternColor} 1px, transparent 1px)`
    backgroundSize = `${density}px ${density}px, ${density}px ${density}px`
  } else if (settings.pattern === 'dots') {
    backgroundImage = `radial-gradient(${patternColor} 1.4px, transparent 2px)`
    backgroundSize = `${density}px ${density}px`
  }

  return {
    backgroundColor: settings.baseColor,
    backgroundImage,
    backgroundSize,
  }
}
