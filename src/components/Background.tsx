import type { BackgroundSettings } from '../types'

interface Props {
  settings: BackgroundSettings
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
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

export function Background({ settings }: Props) {
  const density = clamp(settings.density || 24, 12, 48)
  const opacity = clamp(settings.opacity || 0.08, 0.02, 0.24)
  const base = settings.baseColor || '#f5f8fb'
  const accent = settings.accentColor || '#94a3b8'
  const patternColor = hexToRgba(accent, opacity)
  const glowColor = hexToRgba(accent, Math.min(opacity * 0.9, 0.14))

  let backgroundImage = `radial-gradient(circle at 15% 20%, ${glowColor}, transparent 28%), radial-gradient(circle at 85% 0%, ${glowColor}, transparent 24%)`
  let backgroundSize = 'auto'

  if (settings.pattern === 'grid') {
    backgroundImage = `${backgroundImage}, linear-gradient(${patternColor} 1px, transparent 1px), linear-gradient(90deg, ${patternColor} 1px, transparent 1px)`
    backgroundSize = `auto, ${density}px ${density}px, ${density}px ${density}px`
  } else if (settings.pattern === 'dots') {
    const dot = Math.max(1, Math.round(density / 18))
    backgroundImage = `${backgroundImage}, radial-gradient(${patternColor} ${dot}px, transparent ${dot + 0.8}px)`
    backgroundSize = `auto, ${density}px ${density}px`
  }

  return (
    <div
      className="fixed inset-0 -z-10 transition-[background-color,background-image] duration-300"
      style={{
        backgroundColor: base,
        backgroundImage,
        backgroundSize,
      }}
      aria-hidden
    />
  )
}
