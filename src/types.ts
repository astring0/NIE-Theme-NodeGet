export interface NodeMeta {
  name: string
  region: string
  tags: string[]
  hidden: boolean
  virtualization: string
  lat: number | null
  lng: number | null
}

export interface StaticSystem {
  system_name?: string
  system_host_name?: string
  system_kernel?: string
  system_kernel_version?: string
  system_os_version?: string
  system_os_long_version?: string
  distribution_id?: string
  arch?: string
  virtualization?: string
  cpu_arch?: string
  system_version?: string
}

export interface StaticCpu {
  brand?: string
  per_core?: { id: number; brand: string; frequency: number }[]
  physical_cores?: number
  logical_cores?: number
}

export interface StaticData {
  uuid?: string
  timestamp?: number
  system?: StaticSystem
  cpu?: StaticCpu
  gpu?: unknown[]
}

export interface DynamicSummary {
  uuid: string
  timestamp: number
  cpu_usage?: number
  used_memory?: number
  total_memory?: number
  available_memory?: number
  used_swap?: number
  total_swap?: number
  total_space?: number
  available_space?: number
  receive_speed?: number
  transmit_speed?: number
  total_received?: number
  total_transmitted?: number
  read_speed?: number
  write_speed?: number
  load_one?: number
  load_five?: number
  load_fifteen?: number
  uptime?: number
  boot_time?: number
  process_count?: number
  tcp_connections?: number
  udp_connections?: number
}

export interface HistorySample {
  t: number
  cpu: number | null
  mem: number | null
  disk: number | null
  netIn: number
  netOut: number
}


export type LatencyTaskType = 'ping' | 'tcp_ping' | 'http_ping'

export interface TaskQueryRow {
  cron_source?: string | null
  error_message?: string | null
  success?: boolean | null
  task_event_result?: Partial<Record<LatencyTaskType, number>>
  task_event_type?: Partial<Record<LatencyTaskType, string>>
  task_id?: number
  timestamp: number
  uuid: string
}

export interface LatencySample {
  id: string
  t: number
  value: number
  type: LatencyTaskType
  target: string
  cron?: string | null
}

export interface Node {
  uuid: string
  source: string
  online: boolean
  meta: NodeMeta
  static: StaticData
  dynamic: DynamicSummary | null
  history: HistorySample[]
}

export interface SiteConfig {
  site_name?: string
  site_logo?: string
  footer?: string
  site_tokens: { name: string; backend_url: string; token: string }[]
}

export type View = 'cards' | 'table'

export interface Usage {
  cpu?: number
  mem?: number
  memUsed: number
  memTotal: number
  disk?: number
  diskUsed: number
  diskTotal: number
  netIn?: number
  netOut?: number
  uptime?: number
  ts?: number
}
