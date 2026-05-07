import { useEffect, useRef, useState } from 'react'
import { Search as SearchIcon, X } from 'lucide-react'
import { Search } from './Search'
import { ViewToggle } from './ViewToggle'
import { ThemeToggle } from './ThemeToggle'
import { SortMenu } from './SortMenu'
import { Button } from './ui/button'
import { BackgroundCustomizer } from './BackgroundCustomizer'
import type { BackgroundSettings, Sort, View } from '../types'

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
  const [searchOpen, setSearchOpen] = useState(false)
  const [stuck, setStuck] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    const onScroll = () => {
      const h = headerRef.current?.offsetHeight ?? 60
      setStuck(window.scrollY > h)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      ref={headerRef}
      className={`sticky top-0 z-50 transition-[background-color,border-color] duration-150 ${
        stuck
          ? 'border-b border-dashed border-border bg-background/92 backdrop-blur'
          : 'border-b border-dashed border-border/70 bg-background/72 backdrop-blur-sm'
      }`}
    >
      <div className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between gap-2 overflow-visible px-3 py-3 sm:h-20 sm:gap-3 sm:px-6">
        <a
          href="./"
          className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden transition-opacity hover:opacity-80 sm:gap-3"
        >
          {logo && <img src={logo} alt="" className="h-9 w-9 shrink-0 rounded-xl border border-border object-cover sm:h-11 sm:w-11" />}
          <span className="block max-w-full truncate text-base font-black tracking-wide text-primary sm:text-xl">{siteName}</span>
        </a>
        <div className="flex shrink-0 items-center gap-1.5 pl-1 sm:gap-2.5">
          <div className="hidden sm:block">
            <Search value={query} onChange={onQuery} />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 rounded-xl sm:hidden"
            onClick={() => setSearchOpen(o => !o)}
            aria-label={searchOpen ? '关闭搜索' : '搜索'}
          >
            {searchOpen ? <X className="h-4 w-4" /> : <SearchIcon className="h-4 w-4" />}
          </Button>
          <BackgroundCustomizer settings={backgroundSettings} onChange={onBackgroundSettingsChange} className="hidden sm:inline-flex" />
          <SortMenu value={sort} onChange={onSort} />
          <ViewToggle value={view} onChange={onView} />
          <ThemeToggle />
        </div>
      </div>

      <div
        aria-hidden={!searchOpen}
        className={`overflow-hidden transition-all duration-150 ease-out sm:hidden ${
          searchOpen ? 'max-h-32 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="space-y-3 px-4 pb-3 pt-1">
          <Search ref={inputRef} value={query} onChange={onQuery} className="w-full" />
          <div className="flex justify-end">
            <BackgroundCustomizer settings={backgroundSettings} onChange={onBackgroundSettingsChange} />
          </div>
        </div>
      </div>
    </header>
  )
}
