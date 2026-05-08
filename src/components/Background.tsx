import { useEffect, useMemo, useState } from 'react'
import type { BackgroundSettings } from '../types'

interface Props {
  settings: BackgroundSettings
}

const PALETTE_LINKS = [
  { light: ['#f5f8fb', '#7db4d8'], dark: ['#111827', '#94a3b8'] },
  { light: ['#f2fbf6', '#34d399'], dark: ['#102019', '#4ade80'] },
  { light: ['#f2f7ff', '#60a5fa'], dark: ['#0f172a', '#38bdf8'] },
  { light: ['#f7f3ff', '#a78bfa'], dark: ['#1f1832', '#a78bfa'] },
  { light: ['#fff7ed', '#fb923c'], dark: ['#2a1b12', '#fb923c'] },
  { light: ['#fff1f2', '#fb7185'], dark: ['#2b161d', '#fb7185'] },
  { light: ['#fffbea', '#facc15'], dark: ['#272113', '#facc15'] },
] as const

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function parseHex(hex: string) {
  const raw = hex.replace('#', '')
  const full = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return { r: 148, g: 163, b: 184 }
  const n = Number.parseInt(full, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function hexToRgba(hex: string, alpha: number) {
  const { r, g, b } = parseHex(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function mixRgb(a: ReturnType<typeof parseHex>, b: ReturnType<typeof parseHex>, weightB: number) {
  const w = clamp(weightB, 0, 1)
  return {
    r: Math.round(a.r * (1 - w) + b.r * w),
    g: Math.round(a.g * (1 - w) + b.g * w),
    b: Math.round(a.b * (1 - w) + b.b * w),
  }
}

function rgbToHslParts({ r, g, b }: ReturnType<typeof parseHex>) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0)
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h /= 6
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  }
}

function hslString({ h, s, l }: ReturnType<typeof rgbToHslParts>) {
  return `${h} ${s}% ${l}%`
}

function rgbToHsl(rgb: ReturnType<typeof parseHex>) {
  return hslString(rgbToHslParts(rgb))
}

function contrastTone(accentRgb: ReturnType<typeof parseHex>, dark: boolean) {
  const { h } = rgbToHslParts(accentRgb)
  let hue = 36
  if (h >= 18 && h <= 72) hue = 205
  else if (h >= 95 && h <= 170) hue = 32
  else if (h >= 171 && h <= 260) hue = 34
  else if (h >= 261 && h <= 330) hue = 158
  return `${hue} ${dark ? '78% 64%' : '84% 55%'}`
}

function luminance({ r, g, b }: ReturnType<typeof parseHex>) {
  const channel = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return channel(r) * 0.2126 + channel(g) * 0.7152 + channel(b) * 0.0722
}

function themeVars(base: string, accent: string, dark: boolean) {
  const baseRgb = parseHex(base)
  const accentRgb = parseHex(accent)
  const white = { r: 255, g: 255, b: 255 }
  const black = { r: 0, g: 0, b: 0 }

  const neutralBorder = dark ? { r: 64, g: 76, b: 96 } : { r: 203, g: 213, b: 225 }
  const neutralLine = dark ? { r: 49, g: 59, b: 76 } : { r: 226, g: 232, b: 240 }
  const card = dark ? mixRgb(baseRgb, white, 0.095) : mixRgb(baseRgb, white, 0.92)
  const secondary = dark ? mixRgb(baseRgb, accentRgb, 0.11) : mixRgb(mixRgb(baseRgb, white, 0.78), accentRgb, 0.035)
  const muted = dark ? mixRgb(baseRgb, accentRgb, 0.08) : mixRgb(mixRgb(baseRgb, white, 0.86), accentRgb, 0.025)
  const border = dark ? mixRgb(neutralBorder, accentRgb, 0.2) : mixRgb(neutralBorder, accentRgb, 0.16)
  const input = dark ? mixRgb(neutralBorder, accentRgb, 0.25) : mixRgb(neutralBorder, accentRgb, 0.2)
  const lineSoft = dark ? mixRgb(neutralLine, accentRgb, 0.14) : mixRgb(neutralLine, accentRgb, 0.1)
  const lineStrong = dark ? mixRgb(neutralBorder, accentRgb, 0.26) : mixRgb(neutralBorder, accentRgb, 0.24)
  const foreground = dark ? mixRgb(white, baseRgb, 0.08) : { r: 49, g: 63, b: 84 }
  const mutedForeground = dark ? mixRgb(white, baseRgb, 0.34) : { r: 109, g: 124, b: 146 }
  const primaryForeground = luminance(accentRgb) > 0.62 ? mixRgb(black, accentRgb, 0.08) : white

  return {
    '--background': rgbToHsl(dark ? baseRgb : mixRgb(baseRgb, white, 0.16)),
    '--foreground': rgbToHsl(foreground),
    '--card': rgbToHsl(card),
    '--card-foreground': rgbToHsl(foreground),
    '--popover': rgbToHsl(card),
    '--popover-foreground': rgbToHsl(foreground),
    '--primary': rgbToHsl(accentRgb),
    '--primary-foreground': rgbToHsl(primaryForeground),
    '--secondary': rgbToHsl(secondary),
    '--secondary-foreground': rgbToHsl(foreground),
    '--muted': rgbToHsl(muted),
    '--muted-foreground': rgbToHsl(mutedForeground),
    '--accent': rgbToHsl(secondary),
    '--accent-foreground': rgbToHsl(accentRgb),
    '--border': rgbToHsl(border),
    '--input': rgbToHsl(input),
    '--ring': rgbToHsl(accentRgb),
    '--line-soft': rgbToHsl(lineSoft),
    '--line-strong': rgbToHsl(lineStrong),
    '--contrast': contrastTone(accentRgb, dark),
  }
}

function linkedColors(base: string, accent: string, dark: boolean) {
  for (const pair of PALETTE_LINKS) {
    const [lb, la] = pair.light
    const [db, da] = pair.dark
    if (base === lb && accent === la) {
      return { base: dark ? db : lb, accent: dark ? da : la }
    }
    if (base === db && accent === da) {
      return { base: dark ? db : lb, accent: dark ? da : la }
    }
  }
  return { base, accent }
}

export function Background({ settings }: Props) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  useEffect(() => {
    const target = document.documentElement
    const observer = new MutationObserver(() => {
      setDark(target.classList.contains('dark'))
    })
    observer.observe(target, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const resolved = useMemo(
    () => linkedColors(settings.baseColor || '#f5f8fb', settings.accentColor || '#94a3b8', dark),
    [dark, settings.accentColor, settings.baseColor],
  )

  useEffect(() => {
    const target = document.documentElement
    const vars = themeVars(resolved.base, resolved.accent, dark)
    for (const [key, value] of Object.entries(vars)) target.style.setProperty(key, value)
    return () => {
      for (const key of Object.keys(vars)) target.style.removeProperty(key)
    }
  }, [dark, resolved.accent, resolved.base])

  const style = useMemo(() => {
    const density = clamp(settings.density || 24, 12, 48)
    const opacity = clamp(settings.opacity || 0.065, 0.02, 0.24)
    const patternColor = hexToRgba(
      resolved.accent,
      settings.pattern === 'dots'
        ? dark
          ? Math.min(opacity * 1.3, 0.18)
          : opacity
        : dark
          ? Math.min(opacity * 1.22, 0.17)
          : opacity,
    )

    let backgroundImage = 'none'
    let backgroundSize = 'auto'
    let backgroundPosition = '0 0'

    const contrastColor = dark ? 'rgba(251, 191, 36, 0.08)' : 'rgba(251, 146, 60, 0.075)'
    const glowA = hexToRgba(resolved.accent, dark ? 0.13 : 0.09)
    const atmosphere = `radial-gradient(circle at 18% 8%, ${glowA}, transparent 32%), radial-gradient(circle at 86% 16%, ${contrastColor}, transparent 34%)`

    if (settings.pattern === 'grid') {
      backgroundImage = `${atmosphere}, linear-gradient(to right, ${patternColor} 1px, transparent 1px), linear-gradient(to bottom, ${patternColor} 1px, transparent 1px)`
      backgroundSize = `auto, ${density}px ${density}px, ${density}px ${density}px`
      backgroundPosition = `0 0, -1px -1px, -1px -1px`
    } else if (settings.pattern === 'dots') {
      const dot = Math.max(1, Math.round(density / 20))
      backgroundImage = `${atmosphere}, radial-gradient(circle, ${patternColor} ${dot}px, transparent ${dot + 0.6}px)`
      backgroundSize = `auto, ${density}px ${density}px`
    } else {
      backgroundImage = atmosphere
    }

    return {
      backgroundColor: resolved.base,
      backgroundImage,
      backgroundSize,
      backgroundPosition,
    }
  }, [dark, resolved.accent, resolved.base, settings])

  return (
    <div
      className="fixed inset-0 z-0 pointer-events-none transition-colors duration-150"
      style={style}
      aria-hidden
    />
  )
}
