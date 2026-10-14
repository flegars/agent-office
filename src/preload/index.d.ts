import type { OfficeApi } from '../shared/ipc'

declare global {
  interface Window {
    office: OfficeApi
  }
}
