import { normalizePayload } from '../core/normalize'
import { OfficeStore } from '../core/office'
import type { OfficeSnapshot } from '../core/types'

const TICK_INTERVAL_MS = 1_000
const BROADCAST_DELAY_MS = 50

export class OfficeService {
  private readonly store = new OfficeStore()
  private tickTimer: NodeJS.Timeout | null = null
  private broadcastTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly onChange: () => void,
    private readonly now: () => number = Date.now
  ) {}

  start(): void {
    this.tickTimer ??= setInterval(() => {
      if (this.store.tick(this.now())) this.scheduleBroadcast()
    }, TICK_INTERVAL_MS)
  }

  stop(): void {
    if (this.tickTimer) clearInterval(this.tickTimer)
    if (this.broadcastTimer) clearTimeout(this.broadcastTimer)
    this.tickTimer = null
    this.broadcastTimer = null
  }

  ingest(payload: unknown): void {
    const event = normalizePayload(payload, this.now())
    if (event && this.store.apply(event)) {
      this.scheduleBroadcast()
    }
  }

  snapshot(): OfficeSnapshot {
    return this.store.snapshot()
  }

  private scheduleBroadcast(): void {
    this.broadcastTimer ??= setTimeout(() => {
      this.broadcastTimer = null
      this.onChange()
    }, BROADCAST_DELAY_MS)
  }
}
