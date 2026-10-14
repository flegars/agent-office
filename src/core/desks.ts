import type { Desk, DeskKind } from './types'

export const ISLANDS_PER_ROW = 2
export const BENCH_SEATS = 4
const MIN_ISLANDS = 2
const DESKS_PER_ISLAND = 1 + BENCH_SEATS

// Une session dirige un ilot depuis son bureau de lead ; ses sous-agents occupent les postes
// face a face de cet ilot, puis debordent vers l'ilot le plus proche.
export class IslandPlan {
  private occupants: (string | null)[] = []

  constructor(private readonly islandsPerRow: number = ISLANDS_PER_ROW) {
    this.ensureIslands(MIN_ISLANDS)
  }

  get islands(): number {
    return this.occupants.length / DESKS_PER_ISLAND
  }

  assignLeadDesk(occupantId: string): number {
    const islands = this.islandIndexes()
    const island =
      islands.find((index) => this.isEmpty(index)) ??
      islands.find((index) => this.occupants[leadDeskOf(index)] === null) ??
      this.addIsland()
    return this.occupy(leadDeskOf(island), occupantId)
  }

  assignBenchDesk(occupantId: string, leadDeskId: number): number {
    const home = islandOf(leadDeskId)
    const byPreference = this.islandIndexes().sort(
      (a, b) =>
        this.overflowRank(a, home) - this.overflowRank(b, home) ||
        this.distance(a, home) - this.distance(b, home)
    )
    for (const island of byPreference) {
      const seat = this.freeBenchDesk(island)
      if (seat !== null) return this.occupy(seat, occupantId)
    }
    return this.occupy(benchDesksOf(this.addIsland())[0], occupantId)
  }

  release(deskId: number): void {
    if (deskId < this.occupants.length) {
      this.occupants[deskId] = null
    }
    this.trimEmptyTrailingIslands()
  }

  desks(): Desk[] {
    return this.occupants.map((occupantId, id) => ({ id, ...deskLocation(id), occupantId }))
  }

  // Chez soi d'abord, puis un ilot sans lead (personne n'y attend son equipe), puis chez les autres.
  private overflowRank(island: number, home: number): number {
    if (island === home) return 0
    return this.occupants[leadDeskOf(island)] === null ? 1 : 2
  }

  // Changer de rangee d'ilots coute plus cher que passer a l'ilot d'a cote.
  private distance(a: number, b: number): number {
    const rowGap = Math.abs(Math.floor(a / this.islandsPerRow) - Math.floor(b / this.islandsPerRow))
    const colGap = Math.abs((a % this.islandsPerRow) - (b % this.islandsPerRow))
    return rowGap * this.islandsPerRow + colGap
  }

  private freeBenchDesk(island: number): number | null {
    return benchDesksOf(island).find((id) => this.occupants[id] === null) ?? null
  }

  private isEmpty(island: number): boolean {
    return desksOf(island).every((id) => this.occupants[id] === null)
  }

  private islandIndexes(): number[] {
    return Array.from({ length: this.islands }, (_, index) => index)
  }

  private addIsland(): number {
    this.ensureIslands(this.islands + 1)
    return this.islands - 1
  }

  private occupy(deskId: number, occupantId: string): number {
    this.occupants[deskId] = occupantId
    return deskId
  }

  private ensureIslands(count: number): void {
    while (this.islands < count) {
      this.occupants.push(...Array<string | null>(DESKS_PER_ISLAND).fill(null))
    }
  }

  private trimEmptyTrailingIslands(): void {
    while (this.islands > MIN_ISLANDS && this.isEmpty(this.islands - 1)) {
      this.occupants.splice(-DESKS_PER_ISLAND)
    }
  }
}

export interface DeskLocation {
  kind: DeskKind
  island: number
  seat: number
}

export function deskLocation(deskId: number): DeskLocation {
  const slot = deskId % DESKS_PER_ISLAND
  return {
    kind: slot === 0 ? 'lead' : 'bench',
    island: islandOf(deskId),
    seat: slot === 0 ? 0 : slot - 1
  }
}

function islandOf(deskId: number): number {
  return Math.floor(deskId / DESKS_PER_ISLAND)
}

function leadDeskOf(island: number): number {
  return island * DESKS_PER_ISLAND
}

function benchDesksOf(island: number): number[] {
  return Array.from({ length: BENCH_SEATS }, (_, seat) => leadDeskOf(island) + 1 + seat)
}

function desksOf(island: number): number[] {
  return [leadDeskOf(island), ...benchDesksOf(island)]
}
