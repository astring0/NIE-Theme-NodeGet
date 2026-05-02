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
import { TagFilter } from './components/TagFilter'
import type { View } from './types'

const DEFAULT_LOGO = `${import.meta.env.BASE_URL}logo.png`
const VIEW_KEY = 'nodeget.view'

function initialView(): View {
  const v = localStorage.getItem(VIEW_KEY)
  return v === 'table' ? 'table' : 'cards'
}

function readHash() {
  return decodeURIComponent(window.location.hash.slice(1)) || null
}

export function App() {
  const { config, error: configError } = useConfig()
  const { nodes, errors } = useNodes(config)

  const [view, setView] = useState<View>(initialView)
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(readHash)

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view)
  }, [view])

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

  useEffect(() => {
    if (activeTag && !allTags.includes(activeTag)) setActiveTag(null)
  }, [allTags, activeTag])

  const list = useMemo(() => {
    let arr = [...nodes.values()].filter(n => !n.meta?.hidden)
    if (activeTag) arr = arr.filter(n => n.meta?.tags?.includes(activeTag))

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

    return arr.sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1
      const an = a.meta?.name || a.uuid
      const bn = b.meta?.name || b.uuid
      return an.localeCompare(bn)
    })
  }, [nodes, query, activeTag])

  const selectedNode = selected ? nodes.get(selected) || null : null
  const selectedBackend = selectedNode
    ? config?.site_tokens.find(t => t.name === selectedNode.source) ?? null
    : null

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
  const hasErrors = errors.length > 0

  return (
    <div className="min-h-screen flex flex-col">
      <Background />
      <Navbar
        siteName={config.site_name || '你没设置'}
        logo={logo}
        query={query}
        onQuery={setQuery}
        view={view}
        onView={setView}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {!empty && <TagFilter tags={allTags} active={activeTag} onChange={setActiveTag} />}

        {empty && !hasErrors && (
          <div className="py-24 flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm">连接后端中…</span>
          </div>
        )}

        {empty && hasErrors && (
          <div className="py-20 text-center text-muted-foreground">暂无节点</div>
        )}

        {!empty && view === 'cards' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {list.map(n => (
              <NodeCard key={n.uuid} node={n} />
            ))}
          </div>
        )}
        {!empty && view === 'table' && <NodeTable nodes={list} onOpen={setSelected} />}

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
      </main>

      <Footer text={config.footer} />

      <NodeDetail
        node={selectedNode}
        onClose={() => setSelected(null)}
        showSource={(config.site_tokens?.length ?? 0) > 1}
        backend={selectedBackend}
      />
    </div>
  )
}
