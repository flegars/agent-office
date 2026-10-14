import type { OfficeSnapshot } from '../core/types'

export const IPC_CHANNELS = {
  update: 'office:update',
  getUpdate: 'office:get-update'
} as const

export interface ServerStatus {
  host: string
  port: number
  listening: boolean
  error: string | null
}

export interface OfficeUpdate {
  office: OfficeSnapshot
  server: ServerStatus
}

export interface OfficeApi {
  getUpdate: () => Promise<OfficeUpdate>
  onUpdate: (listener: (update: OfficeUpdate) => void) => () => void
}
