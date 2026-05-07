import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from './components/ui/alert'
import { useConfig } from './hooks/useConfig'
import { useNodes } from './hooks/useNodes'
import { Background } from './components/Background'
import { Navbar } from './components/Navbar'
import { Footer } from './components/Footer'
import { NodeCard } from './components/NodeCard'
import { NodeTable } from './components/NodeTable'
import { NodeDetail } from './components/NodeDetail'
import { WorldMap } from './components/WorldMap'
import { TagFilter } from './components/TagFilter'
import { RegionFilter } from './components/RegionFilter'
import { ValueSidebar } from './components/ValueSidebar'
import { deriveUsage, displayName } from './utils/derive'
import type { BackgroundSettings, Node, Sort, View } from './types'
import { nodeKey } from './utils/nodeKey'

const DEFAULT_LOGO = `${import.meta.env.BASE_URL}logo.png`
const VIEW_KEY = 'nodeget.view'
const SORT_KEY = 'nodeget.sort'
const BG_KEY = 'nodeget.background-settings'
const DEFAULT_BG: BackgroundSettings = {
  pattern: 'grid',
  baseColor: '#f5f8fb',
  accentColor: '#b7c4d6',
  density: 22,
  opacity: 0.09,
}

function initialView(): View {
  const v = localStorage.getItem(VIEW_KEY)
  if (v === 'table' || v === 'map') return v
  return 'cards'
}

function initialSort(): Sort {
  return (localStorage.getItem(SORT_KEY) as Sort) || 'default'
}

function initialBackgroundSettings(): BackgroundSettings {
  try {
    const raw = localStorage.getItem(BG_KEY)
    if (!raw) return DEFAULT_BG
    const parsed = JSON.parse(raw)
    return {
      pattern: parsed.pattern === 'solid' || parsed.pattern === 'dots' ? parsed.pattern : 'grid',
      baseColor: typeof parsed.baseColor === 'string' ? parsed.baseColor : DEFAULT_BG.baseColor,
      accentColor: typeof parsed.accentColor === 'string' ? parsed.accentColor : DEFAULT_BG.accentColor,
      density: typeof parsed.density === 'number' ? parsed.density : DEFAULT_BG.density,
      opacity: typeof parsed.opacity === 'number' ? parsed.opacity : DEFAULT_BG.opacity,
    }
  } catch {
    return DEFAULT_BG
  }
}

function readHash() {
  return decodeURIComponent(window.location.hash.slice(1)) || null
}

const num = (v?: number) => (Number.isFinite(v) ? (v as number) : -Infinity)

function findLegacyNode(nodes: Map<string, Node>, uuid: string) {
  for (const n of nodes.values()) {
    if (n.uuid === uuid) return n
  }
  return null
}

export function App() {
  const { config, error: configError } = useConfig()
  const { nodes, errors, loading, pool } = useNodes(config)

  const [view, setView] = useState<View>(initialView)
  const [sort, setSort] = useState<Sort>(initialSort)
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [activeRegion, setActiveRegion] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(readHash)
  const [backgroundSettings, setBackgroundSettings] = useState<BackgroundSettings>(initialBackgroundSettings)

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view)
  }, [view])

  useEffect(() => {
    localStorage.setItem(SORT_KEY, sort)
  }, [sort])

  useEffect(() => {
    localStorage.setItem(BG_KEY, JSON.stringify(backgroundSettings))
  }, [backgroundSettings])

  useEffect(() => {
    const onHash = () => setSelected(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    const target = selected ? `#${encodeURIComponent(selected)}` : ''
    if (window.location.hash === target) return
    if (selected) {
      window.location.hash = encodeURIComponent(selected)
    } else {
      history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [selected])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const n of nodes.values()) {
      if (n.meta?.hidden) continue
      for (const t of n.meta?.tags ?? []) set.add(t)
    }
    return [...set].sort()
  }, [nodes])

  const regions = useMemo(() => {
    const map = new Map<string, number>()
    let total = 0
    for (const n of nodes.values()) {
      if (n.meta?.hidden) continue
      total++
      const code = n.meta?.region?.trim().toUpperCase()
      if (!code || !/^[A-Z]{2}$/.test(code)) continue
      map.set(code, (map.get(code) ?? 0) + 1)
    }
    const list = [...map.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
    return { list, total }
  }, [nodes])

  useEffect(() => {
    if (activeTag && !allTags.includes(activeTag)) setActiveTag(null)
  }, [allTags, activeTag])

  useEffect(() => {
    if (activeRegion && !regions.list.some(r => r.code === activeRegion)) setActiveRegion(null)
  }, [regions, activeRegion])

  const list = useMemo(() => {
    let arr = [...nodes.values()].filter(n => !n.meta?.hidden)
    if (activeTag) arr = arr.filter(n => n.meta?.tags?.includes(activeTag))
    if (activeRegion) {
      arr = arr.filter(n => n.meta?.region?.trim().toUpperCase() === activeRegion)
    }

    const q = query.trim().toLowerCase()
    if (q) {
      arr = arr.filter(n => {
        const hay = [
          n.uuid,
          n.source,
          n.meta?.name,
          n.meta?.region,
          n.meta?.virtualization,
          n.static?.system?.system_host_name,
          n.static?.system?.system_name,
          ...(n.meta?.tags ?? []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
    }

    const rank = new Map(regions.list.map((r, i) => [r.code, i]))

    return arr.sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1

      const ua = deriveUsage(a)
      const ub = deriveUsage(b)
      let cmp = 0
      if (sort === 'cpu') cmp = num(ub.cpu) - num(ua.cpu)
      else if (sort === 'mem') cmp = num(ub.mem) - num(ua.mem)
      else if (sort === 'disk') cmp = num(ub.disk) - num(ua.disk)
      else if (sort === 'netIn') cmp = num(ub.netIn) - num(ua.netIn)
      else if (sort === 'netOut') cmp = num(ub.netOut) - num(ua.netOut)
      else if (sort === 'uptime') cmp = num(ub.uptime) - num(ua.uptime)
      else if (sort === 'region') {
        const ar = rank.get(a.meta?.region?.trim().toUpperCase() || '') ?? Infinity
        const br = rank.get(b.meta?.region?.trim().toUpperCase() || '') ?? Infinity
        cmp = ar - br
      }
      else if (sort === 'default') cmp = (a.meta?.order ?? 0) - (b.meta?.order ?? 0)
      else if (sort === 'name') cmp = displayName(a).localeCompare(displayName(b))

      return cmp || displayName(a).localeCompare(displayName(b))
    })
  }, [nodes, query, activeTag, activeRegion, sort, regions])

  const selectedNode = selected ? nodes.get(selected) || findLegacyNode(nodes, selected) : null

  if (configError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <Alert variant="destructive" className="max-w-lg">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>加载 config.json 失败</AlertTitle>
          <AlertDescription>{String(configError.message || configError)}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        加载中…
      </div>
    )
  }

  const logo = config.site_logo || DEFAULT_LOGO
  const empty = list.length === 0
  const noNodes = nodes.size === 0
  const hasErrors = errors.length > 0

  return (
    <div className="min-h-screen flex flex-col">
      <Background settings={backgroundSettings} />
      <Navbar
        siteName={config.site_name || '你没设置'}
        logo={logo}
        query={query}
        onQuery={setQuery}
        view={view}
        onView={setView}
        sort={sort}
        onSort={setSort}
        backgroundSettings={backgroundSettings}
        onBackgroundSettingsChange={setBackgroundSettings}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside>
            <ValueSidebar nodes={list} />
          </aside>

          <section className="space-y-6 min-w-0">
            {!empty && (
              <RegionFilter
                regions={regions.list}
                total={regions.total}
                active={activeRegion}
                onChange={setActiveRegion}
              />
            )}
            {!empty && <TagFilter tags={allTags} active={activeTag} onChange={setActiveTag} />}

            {empty && loading && (
              <div className="py-24 flex flex-col items-center gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-sm">连接后端中…</span>
              </div>
            )}

            {empty && !loading && (
              <div className="py-20 text-center text-muted-foreground">
                {noNodes ? '暂无节点' : '没有匹配的节点'}
              </div>
            )}

            {!empty && view === 'cards' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-4">
                {list.map(n => (
                  <NodeCard key={nodeKey(n)} node={n} pool={pool} />
                ))}
              </div>
            )}
            {!empty && view === 'table' && <NodeTable nodes={list} onOpen={setSelected} />}
            {!empty && view === 'map' && <WorldMap nodes={list} onOpen={setSelected} />}

            {hasErrors && (
              <Alert variant="warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{errors.length} 个后端错误</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-5 space-y-1 mt-2">
                    {errors.map((e, i) => (
                      <li key={i}>
                        <b>{e.source}</b>：
                        {e.error instanceof Error ? e.error.message : String(e.error)}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </section>
        </div>
      </main>

      <Footer text={config.footer} />

      <NodeDetail
        node={selectedNode}
        onClose={() => setSelected(null)}
        showSource={(config.site_tokens?.length ?? 0) > 1}
        pool={pool}
      />
    </div>
  )
}
