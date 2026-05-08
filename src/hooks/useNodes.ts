import { useEffect, useMemo, useState } from 'react'
import { BackendPool } from '../api/pool'
import { dynamicSummaryAvg, dynamicSummaryMulti, dynamicSummaryQuery, kvGetMulti, listAgentUuids, staticDataMulti } from '../api/methods'
import { isOnline, normalizeMs } from '../utils/status'
import { nodeKeyFrom } from '../utils/nodeKey'
import type { DynamicSummary, HistorySample, Node, NodeMeta, SiteConfig } from '../types'

type Agent = Pick<Node, 'uuid' | 'source' | 'meta' | 'static'>

interface BackendError {
  source: string
  error: unknown
}

interface DynamicUpdate {
  source: string
  row: DynamicSummary
}

const STATIC_FIELDS = ['cpu', 'system']
const DYNAMIC_FIELDS = [
  'cpu_usage',
  'used_memory',
  'total_memory',
  'available_memory',
  'used_swap',
  'total_swap',
  'total_space',
  'available_space',
  'read_speed',
  'write_speed',
  'receive_speed',
  'transmit_speed',
  'total_received',
  'total_transmitted',
  'load_one',
  'load_five',
  'load_fifteen',
  'uptime',
  'boot_time',
  'process_count',
  'tcp_connections',
  'udp_connections',
]
const META_KEYS = [
  'metadata_name',
  'metadata_region',
  'metadata_tags',
  'metadata_hidden',
  'metadata_virtualization',
  'metadata_latitude',
  'metadata_longitude',
  'metadata_order',
  'metadata_price',
  'metadata_price_unit',
  'metadata_price_cycle',
  'metadata_expire_time',
]

// 官方默认值 2s 比较灵敏；魔改版的 10s 会让资源状态明显慢半拍。
const DYN_INTERVAL_MS = 2000
const HISTORY_LIMIT = 300
const HISTORY_WINDOW_MS = 4 * 60 * 60 * 1000
const HISTORY_POINTS = 80
const HISTORY_CACHE_KEY = 'nodeget.history.cache.v13'
const META_CACHE_KEY = 'nodeget.meta.cache.v2'

function emptyMeta(): NodeMeta {
  return {
    name: '',
    region: '',
    tags: [],
    hidden: false,
    virtualization: '',
    lat: null,
    lng: null,
    order: 0,
    price: 0,
    priceUnit: '$',
    priceCycle: 30,
    expireTime: '',
  }
}

function blankAgent(uuid: string, source: string, meta?: NodeMeta): Agent {
  return { uuid, source, meta: meta ?? emptyMeta(), static: {} }
}

function parseBoolean(value: unknown) {
  if (value === true || value === 1) return true
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase()
    return v === 'true' || v === '1' || v === 'yes' || v === 'on'
  }
  return false
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map(s => s.trim()).filter(Boolean)
  if (typeof value !== 'string') return []
  const raw = value.trim()
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.map(String).map(s => s.trim()).filter(Boolean)
  } catch {}
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

function stringValue(value: unknown) {
  if (value == null) return ''
  return String(value).trim()
}

function parseMeta(raw: Record<string, unknown>): NodeMeta {
  const lat = Number(raw.metadata_latitude)
  const lng = Number(raw.metadata_longitude)
  const order = Number(raw.metadata_order)
  const price = Number(raw.metadata_price)
  const cycle = Number(raw.metadata_price_cycle)
  return {
    name: stringValue(raw.metadata_name),
    region: stringValue(raw.metadata_region),
    tags: parseTags(raw.metadata_tags),
    hidden: parseBoolean(raw.metadata_hidden),
    virtualization: stringValue(raw.metadata_virtualization),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    order: Number.isFinite(order) ? order : 0,
    price: Number.isFinite(price) ? price : 0,
    priceUnit: stringValue(raw.metadata_price_unit) || '$',
    priceCycle: Number.isFinite(cycle) && cycle > 0 ? cycle : 30,
    expireTime: stringValue(raw.metadata_expire_time),
  }
}

function hasOwn(raw: Record<string, unknown> | undefined, key: string) {
  return Boolean(raw && Object.prototype.hasOwnProperty.call(raw, key))
}

function mergeMeta(prev: NodeMeta | undefined, next: NodeMeta, raw?: Record<string, unknown>): NodeMeta {
  const base = prev ?? emptyMeta()
  return {
    name: next.name || base.name,
    region: next.region || base.region,
    tags: next.tags.length ? next.tags : base.tags,
    hidden: hasOwn(raw, 'metadata_hidden') ? next.hidden : base.hidden,
    virtualization: next.virtualization || base.virtualization,
    lat: hasOwn(raw, 'metadata_latitude') ? next.lat : base.lat,
    lng: hasOwn(raw, 'metadata_longitude') ? next.lng : base.lng,
    order: hasOwn(raw, 'metadata_order') ? next.order : base.order,
    price: hasOwn(raw, 'metadata_price') ? next.price : base.price,
    priceUnit: next.priceUnit || base.priceUnit,
    priceCycle: hasOwn(raw, 'metadata_price_cycle') ? next.priceCycle : base.priceCycle,
    expireTime: next.expireTime || base.expireTime,
  }
}

function sampleFrom(row: DynamicSummary): HistorySample {
  const memTotal = row.total_memory || 0
  const diskTotal = row.total_space || 0
  return {
    t: normalizeMs(row.timestamp) ?? Date.now(),
    cpu: row.cpu_usage ?? null,
    mem: memTotal && row.used_memory != null ? (row.used_memory / memTotal) * 100 : null,
    disk:
      diskTotal && row.available_space != null
        ? ((diskTotal - row.available_space) / diskTotal) * 100
        : null,
    netIn: row.receive_speed ?? 0,
    netOut: row.transmit_speed ?? 0,
  }
}

function isUsableHistoryRow(row: DynamicSummary | null | undefined) {
  return Boolean(row?.timestamp && normalizeMs(row.timestamp))
}

function mergeHistory(existing: HistorySample[] | undefined, incoming: HistorySample[]) {
  const byTime = new Map<number, HistorySample>()
  for (const item of existing || []) byTime.set(item.t, item)
  for (const item of incoming) byTime.set(item.t, item)
  return [...byTime.values()].sort((a, b) => a.t - b.t).slice(-HISTORY_LIMIT)
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = []
  let index = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++]
      results.push(await fn(current))
    }
  })
  await Promise.all(workers)
  return results
}


function readJsonMap<T>(key: string, isValid: (value: unknown) => value is T) {
  if (typeof window === 'undefined') return new Map<string, T>()
  try {
    const raw = sessionStorage.getItem(key) || localStorage.getItem(key)
    if (!raw) return new Map<string, T>()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const map = new Map<string, T>()
    for (const [k, v] of Object.entries(parsed || {})) {
      if (isValid(v)) map.set(k, v)
    }
    return map
  } catch {
    return new Map<string, T>()
  }
}

function writeJsonMap<T>(key: string, map: Map<string, T>, storage: Storage = sessionStorage) {
  if (typeof window === 'undefined') return
  try {
    const payload: Record<string, T> = {}
    for (const [k, v] of map) payload[k] = v
    storage.setItem(key, JSON.stringify(payload))
  } catch {}
}

function isHistoryList(value: unknown): value is HistorySample[] {
  return Array.isArray(value) && value.every(item => item && typeof item.t === 'number')
}

function isMeta(value: unknown): value is NodeMeta {
  return Boolean(value && typeof value === 'object' && 'name' in value && 'tags' in value)
}

function loadHistoryCache() {
  const map = readJsonMap<HistorySample[]>(HISTORY_CACHE_KEY, isHistoryList)
  for (const [k, list] of map) map.set(k, list.slice(-HISTORY_LIMIT))
  return map
}

function loadMetaCache() {
  return readJsonMap<NodeMeta>(META_CACHE_KEY, isMeta)
}

export function useNodes(config: SiteConfig | null) {
  const [agents, setAgents] = useState<Map<string, Agent>>(new Map())
  const [live, setLive] = useState<Map<string, DynamicSummary>>(new Map())
  const [history, setHistory] = useState<Map<string, HistorySample[]>>(loadHistoryCache)
  const [errors, setErrors] = useState<BackendError[]>([])
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const [pool, setPool] = useState<BackendPool | null>(null)

  useEffect(() => {
    setErrors([])
    if (!config?.site_tokens?.length) {
      setLoading(false)
      return
    }
    const pool = new BackendPool(config.site_tokens)
    setPool(pool)
    setLoading(true)

    const sourceUuids = new Map<string, string[]>()
    const metaCache = loadMetaCache()

    const fetchServerHistory = async (entry: BackendPool['entries'][number], uuids: string[]) => {
      if (!uuids.length) return
      const now = Date.now()
      const from = now - HISTORY_WINDOW_MS
      const fields = ['cpu_usage']
      const jobs = uuids.map(uuid => ({ entry, uuid }))
      const rows = await mapLimit(jobs, 4, async ({ entry, uuid }) => {
        try {
          const avgRows = await dynamicSummaryAvg(entry.client, uuid, fields, from, now, HISTORY_POINTS)
          const samples = (avgRows || []).filter(isUsableHistoryRow).map(sampleFrom)
          if (samples.length) return { source: entry.name, uuid, samples }
        } catch {
          // SQLite / older backend may not support avg; fall back to raw summary rows.
        }

        try {
          const rawRows = await dynamicSummaryQuery(entry.client, uuid, fields, from, now, 1800)
          const samples = (rawRows || []).filter(isUsableHistoryRow).map(sampleFrom)
          return { source: entry.name, uuid, samples }
        } catch {
          return { source: entry.name, uuid, samples: [] as HistorySample[] }
        }
      })

      setHistory(prev => {
        const next = new Map(prev)
        for (const item of rows) {
          if (!item || !item.samples.length) continue
          const key = nodeKeyFrom(item.source, item.uuid)
          next.set(key, mergeHistory(next.get(key), item.samples))
        }
        return next
      })
    }


    const applyMetaAndStatic = async (entry: BackendPool['entries'][number], uuids: string[]) => {
      if (!uuids.length) return

      const kvItems = uuids.flatMap(u => META_KEYS.map(k => ({ namespace: u, key: k })))
      const [meta, stat] = await Promise.allSettled([
        kvGetMulti(entry.client, kvItems),
        staticDataMulti(entry.client, uuids, STATIC_FIELDS),
      ])

      const parsedMetaByKey = new Map<string, NodeMeta>()
      if (meta.status === 'fulfilled' && meta.value) {
        const grouped = new Map<string, Record<string, unknown>>()
        for (const row of meta.value) {
          if (!row || row.value == null) continue
          let bucket = grouped.get(row.namespace)
          if (!bucket) grouped.set(row.namespace, (bucket = {}))
          bucket[row.key] = row.value
        }
        for (const uuid of uuids) {
          const raw = grouped.get(uuid)
          if (!raw) continue
          const key = nodeKeyFrom(entry.name, uuid)
          const cached = metaCache.get(key)
          const parsed = mergeMeta(cached, parseMeta(raw), raw)
          parsedMetaByKey.set(key, parsed)
          metaCache.set(key, parsed)
        }
        writeJsonMap(META_CACHE_KEY, metaCache, localStorage)
      } else if (meta.status === 'rejected') {
        setErrors(prev => [...prev, { source: entry.name, error: meta.reason }])
      }

      setAgents(prev => {
        const next = new Map(prev)

        for (const uuid of uuids) {
          const key = nodeKeyFrom(entry.name, uuid)
          const parsed = parsedMetaByKey.get(key)
          if (!parsed) continue
          const cur = next.get(key) ?? blankAgent(uuid, entry.name, metaCache.get(key))
          next.set(key, { ...cur, meta: mergeMeta(cur.meta, parsed) })
        }

        if (stat.status === 'fulfilled' && stat.value) {
          for (const row of stat.value) {
            if (!row.uuid) continue
            const key = nodeKeyFrom(entry.name, row.uuid)
            const cur = next.get(key) ?? blankAgent(row.uuid, entry.name, metaCache.get(key))
            next.set(key, { ...cur, static: row })
          }
        }
        return next
      })

      if (stat.status === 'rejected') setErrors(prev => [...prev, { source: entry.name, error: stat.reason }])
    }

    const tickDynamic = async () => {
      const updates: DynamicUpdate[] = []
      await Promise.allSettled(
        pool.entries.map(async entry => {
          const uuids = sourceUuids.get(entry.name) || []
          if (!uuids.length) return
          try {
            const rows = await dynamicSummaryMulti(entry.client, uuids, DYNAMIC_FIELDS)
            for (const row of rows || []) updates.push({ source: entry.name, row })
          } catch {}
        }),
      )
      if (!updates.length) return

      setLive(prev => {
        const next = new Map(prev)
        for (const { source, row } of updates) {
          const key = nodeKeyFrom(source, row.uuid)
          const cur = next.get(key)
          const rowTs = normalizeMs(row.timestamp) ?? 0
          const curTs = normalizeMs(cur?.timestamp) ?? 0
          if (!cur || rowTs >= curTs) next.set(key, row)
        }
        return next
      })
      setHistory(prev => {
        const next = new Map(prev)
        for (const { source, row } of updates) {
          const key = nodeKeyFrom(source, row.uuid)
          const arr = next.get(key) || []
          const sample = sampleFrom(row)
          const dedup = arr.length && arr[arr.length - 1].t === sample.t ? arr : arr.concat(sample)
          next.set(key, dedup.slice(-HISTORY_LIMIT))
        }
        return next
      })
    }

    const bootstrap = async () => {
      const agentsRes = await pool.fanout(listAgentUuids)
      setErrors(prev => [...prev, ...agentsRes.errors])

      const seed = new Map<string, Agent>()
      for (const { source, rows } of agentsRes.ok) {
        const uuids = rows ?? []
        sourceUuids.set(source, uuids)
        for (const uuid of uuids) {
          const key = nodeKeyFrom(source, uuid)
          seed.set(key, blankAgent(uuid, source, metaCache.get(key)))
        }
      }
      setAgents(seed)

      // 后端真实历史：用 Dynamic Summary 历史判断 Agent 是否曾与 Server 通信。
      // 只取 timestamp 是否存在来画在线格子，不用历史 CPU / 内存 / 磁盘冒充展示。
      const serverHistory = Promise.all(
        pool.entries.map(entry => fetchServerHistory(entry, sourceUuids.get(entry.name) || [])),
      )

      // 先拉当前动态数据，让 CPU / 内存 / 硬盘尽快显示；元数据、静态信息和历史在线格子异步补齐。
      const metaAndStatic = Promise.all(
        pool.entries.map(entry => applyMetaAndStatic(entry, sourceUuids.get(entry.name) || [])),
      )
      await tickDynamic()
      setLoading(false)
      void metaAndStatic.catch((e: unknown) => {
        setErrors(prev => [...prev, { source: '*', error: e }])
      })
      void serverHistory.catch((e: unknown) => {
        setErrors(prev => [...prev, { source: '*', error: e }])
      })
    }

    bootstrap().catch((e: unknown) => {
      setErrors(prev => [...prev, { source: '*', error: e }])
      setLoading(false)
    })

    const onVisible = () => {
      if (document.visibilityState === 'visible') tickDynamic()
    }
    document.addEventListener('visibilitychange', onVisible)

    const dynTimer = setInterval(tickDynamic, DYN_INTERVAL_MS)
    const clockTimer = setInterval(() => setTick(t => t + 1), 5000)

    return () => {
      clearInterval(dynTimer)
      clearInterval(clockTimer)
      document.removeEventListener('visibilitychange', onVisible)
      setPool(null)
      pool.close()
    }
  }, [config])

  useEffect(() => {
    const cached = new Map([...history].map(([key, list]) => [key, list.slice(-HISTORY_LIMIT)]))
    // 在线状态现在是前端观察到的 Agent 通信历史；写入 localStorage，刷新后不丢。
    writeJsonMap(HISTORY_CACHE_KEY, cached, localStorage)
    // 同时写 sessionStorage，避免个别隐私环境禁用 localStorage 时完全丢失。
    writeJsonMap(HISTORY_CACHE_KEY, cached, sessionStorage)
  }, [history])

  const nodes = useMemo(() => {
    const now = Date.now()
    const out = new Map<string, Node>()
    for (const [key, a] of agents) {
      const dyn = live.get(key) || null
      out.set(key, {
        ...a,
        dynamic: dyn,
        history: history.get(key) || [],
        online: isOnline(dyn?.timestamp, now),
      })
    }
    return out
  }, [agents, live, history, tick])

  return { nodes, errors, loading, pool }
}
