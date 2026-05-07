import { useEffect, useRef, useState } from 'react'
import { ArrowUpDown, Layers3, Paintbrush, Search as SearchIcon, SlidersHorizontal, X } from 'lucide-react'
import { Search } from './Search'
import { ViewToggle } from './ViewToggle'
import { ThemeToggle } from './ThemeToggle'
import { SortMenu } from './SortMenu'
import { Button } from './ui/button'
import { BackgroundCustomizer } from './BackgroundCustomizer'
import type { BackgroundPattern, BackgroundSettings, Sort, View } from '../types'

interface Props {
  siteName: string
  logo?: string
  query: string
  onQuery: (v: string) => void
  view: View
  onView: (v: View) => void
  sort: Sort
  onSort: (v: Sort) => void
  backgroundSettings: BackgroundSettings
  onBackgroundSettingsChange: (settings: BackgroundSettings) => void
}

type MobilePanel = 'search' | 'controls' | null

const SORTS: { value: Sort; label: string }[] = [
  { value: 'default', label: '默认' },
  { value: 'name', label: '名称' },
  { value: 'region', label: '地区' },
  { value: 'cpu', label: 'CPU' },
  { value: 'mem', label: '内存' },
  { value: 'disk', label: '磁盘' },
  { value: 'netIn', label: '下行' },
  { value: 'netOut', label: '上行' },
  { value: 'uptime', label: '在线' },
]

const PATTERNS: { value: BackgroundPattern; label: string }[] = [
  { value: 'grid', label: '网格' },
  { value: 'solid', label: '纯色' },
  { value: 'dots', label: '点状' },
]

const PALETTES = [
  { label: '云白', baseColor: '#f5f8fb', accentColor: '#b7c4d6' },
  { label: '薄荷', baseColor: '#f2fbf6', accentColor: '#34d399' },
  { label: '海盐蓝', baseColor: '#f2f7ff', accentColor: '#60a5fa' },
  { label: '紫雾', baseColor: '#f7f3ff', accentColor: '#a78bfa' },
  { label: '蜜桃', baseColor: '#fff7ed', accentColor: '#fb923c' },
  { label: '玫瑰', baseColor: '#fff1f2', accentColor: '#fb7185' },
  { label: '奶油黄', baseColor: '#fffbea', accentColor: '#facc15' },
  { label: '曜石', baseColor: '#eef2f7', accentColor: '#64748b' },
  { label: '深海', baseColor: '#eef8ff', accentColor: '#0ea5e9' },
  { label: '森林', baseColor: '#eef9f0', accentColor: '#22c55e' },
]

export function Navbar({
  siteName,
  logo,
  query,
  onQuery,
  view,
  onView,
  sort,
  onSort,
  backgroundSettings,
  onBackgroundSettingsChange,
}: Props) {
  const [panel, setPanel] = useState<MobilePanel>(null)
  const [stuck, setStuck] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (panel === 'search') inputRef.current?.focus()
  }, [panel])

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const togglePanel = (next: MobilePanel) => {
    setPanel(cur => (cur === next ? null : next))
  }

  return (
    <header ref={headerRef} className="sticky top-0 z-50 px-3 pb-2 pt-3 sm:px-6">
      <div
        className={`mx-auto max-w-7xl overflow-hidden rounded-2xl border border-border/80 bg-background/88 shadow-[0_14px_36px_rgba(15,23,42,0.08)] backdrop-blur transition-shadow duration-150 dark:shadow-[0_16px_42px_rgba(0,0,0,0.32)] ${
          stuck ? 'shadow-[0_18px_44px_rgba(15,23,42,0.12)] dark:shadow-[0_20px_52px_rgba(0,0,0,0.42)]' : ''
        }`}
      >
        <div className="flex h-16 items-center justify-between gap-2 px-3 sm:h-[68px] sm:gap-3 sm:px-5">
          <a
            href="./"
            className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden transition-opacity hover:opacity-80 sm:gap-3"
          >
            {logo && <img src={logo} alt="" className="h-10 w-10 shrink-0 rounded-xl border border-border object-cover sm:h-11 sm:w-11" />}
            <span className="block max-w-full truncate text-base font-black tracking-wide text-primary sm:text-xl">{siteName}</span>
          </a>

          <div className="hidden shrink-0 items-center gap-2.5 sm:flex">
            <Search value={query} onChange={onQuery} />
            <BackgroundCustomizer settings={backgroundSettings} onChange={onBackgroundSettingsChange} className="hidden sm:inline-flex" />
            <SortMenu value={sort} onChange={onSort} />
            <ViewToggle value={view} onChange={onView} />
            <ThemeToggle />
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:hidden">
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-xl"
              onClick={() => togglePanel('search')}
              aria-label={panel === 'search' ? '关闭搜索' : '搜索'}
            >
              {panel === 'search' ? <X className="h-4 w-4" /> : <SearchIcon className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-xl"
              onClick={() => togglePanel('controls')}
              aria-label={panel === 'controls' ? '关闭控制区' : '打开控制区'}
            >
              {panel === 'controls' ? <X className="h-4 w-4" /> : <SlidersHorizontal className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div
          className={`overflow-hidden border-t border-dashed border-border/80 transition-all duration-150 sm:hidden ${
            panel ? 'max-h-72 opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          {panel === 'search' && (
            <div className="px-4 py-3">
              <Search ref={inputRef} value={query} onChange={onQuery} className="w-full" />
            </div>
          )}

          {panel === 'controls' && (
            <MobileControls
              view={view}
              onView={onView}
              sort={sort}
              onSort={onSort}
              backgroundSettings={backgroundSettings}
              onBackgroundSettingsChange={onBackgroundSettingsChange}
            />
          )}
        </div>
      </div>
    </header>
  )
}

function MobileControls({
  view,
  onView,
  sort,
  onSort,
  backgroundSettings,
  onBackgroundSettingsChange,
}: {
  view: View
  onView: (v: View) => void
  sort: Sort
  onSort: (v: Sort) => void
  backgroundSettings: BackgroundSettings
  onBackgroundSettingsChange: (settings: BackgroundSettings) => void
}) {
  const sortLabel = SORTS.find(item => item.value === sort)?.label || '默认'
  const patternLabel = PATTERNS.find(item => item.value === backgroundSettings.pattern)?.label || '网格'
  const paletteLabel = PALETTES.find(
    item => item.baseColor === backgroundSettings.baseColor && item.accentColor === backgroundSettings.accentColor,
  )?.label || '颜色'

  const cycleSort = () => {
    const idx = Math.max(0, SORTS.findIndex(item => item.value === sort))
    onSort(SORTS[(idx + 1) % SORTS.length].value)
  }

  const cyclePalette = () => {
    const idx = Math.max(0, PALETTES.findIndex(item => item.baseColor === backgroundSettings.baseColor && item.accentColor === backgroundSettings.accentColor))
    const next = PALETTES[(idx + 1) % PALETTES.length]
    onBackgroundSettingsChange({ ...backgroundSettings, baseColor: next.baseColor, accentColor: next.accentColor })
  }

  const cyclePattern = () => {
    const idx = Math.max(0, PATTERNS.findIndex(item => item.value === backgroundSettings.pattern))
    onBackgroundSettingsChange({ ...backgroundSettings, pattern: PATTERNS[(idx + 1) % PATTERNS.length].value })
  }

  return (
    <div className="space-y-3 px-4 py-3">
      <ViewToggle value={view} onChange={onView} />

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-11 justify-start rounded-xl px-3" onClick={cycleSort}>
          <ArrowUpDown className="h-3.5 w-3.5" />
          <span>排序 {sortLabel}</span>
        </Button>
        <ThemeToggle />
        <Button variant="outline" className="h-11 justify-start rounded-xl px-3" onClick={cyclePalette}>
          <Paintbrush className="h-3.5 w-3.5" />
          <span>配色 {paletteLabel}</span>
        </Button>
        <Button variant="outline" className="h-11 justify-start rounded-xl px-3" onClick={cyclePattern}>
          <Layers3 className="h-3.5 w-3.5" />
          <span>背景 {patternLabel}</span>
        </Button>
      </div>
    </div>
  )
}
