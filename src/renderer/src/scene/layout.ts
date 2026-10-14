import { deskLocation } from '../../../core/desks'
import type { DeskKind } from '../../../core/types'

export type Vec3 = [number, number, number]

// Un poste se lit dans son repere local : l'occupant s'assoit cote +z et regarde vers -z.
// Il est ensuite place dans la salle par une position et une rotation autour de y.
export interface Station {
  kind: DeskKind
  position: Vec3
  rotationY: number
  // Couloir (z constant) que l'occupant rejoint en se levant.
  lane: number
}

export interface RoomBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  width: number
  depth: number
  center: Vec3
}

export const CHAIR_OFFSET_Z = 0.45
export const DESK_TOP = 0.384
export const STAND_UP_DISTANCE = 0.5

// Ilot : deux rangees de deux postes dos a dos, separees par une cloison, et le bureau du lead
// en bout d'ilot, tourne vers son equipe.
export const BENCH_PITCH_X = 0.76
export const BENCH_DESK_Z = 0.22
const LEAD_X = 1.55
const LEAD_ROTATION = Math.PI / 2
const ISLAND_PITCH_X = 4.2
const ISLAND_PITCH_Z = 2.8
export const ISLAND_HALF_WIDTH = BENCH_PITCH_X
const LANE_FROM_ISLAND = BENCH_DESK_Z + CHAIR_OFFSET_Z + STAND_UP_DISTANCE
const ISLAND_RIGHT_REACH = LEAD_X + CHAIR_OFFSET_Z + STAND_UP_DISTANCE

const MARGIN = { left: 1.9, front: 1.2 }
// Bande d'ambiance a droite des ilots (detente devant, reunion derriere) et coin cafe le long
// du mur du fond : ils agrandissent la salle mais restent hors des couloirs.
const GAP_BEFORE_ZONES = 0.6
const ZONE_STRIP_WIDTH = 4.4
const LOUNGE_DEPTH = 2.8
const MEETING_DEPTH = 3.4
const CAFE_DEPTH = 1.3
const BACK_MARGIN = CAFE_DEPTH + 0.5
const MIN_DEPTH = LOUNGE_DEPTH + MEETING_DEPTH + 0.8
const CAFE_WIDTH = 3.2
const STORAGE = { depth: 0.5, fromDoor: 0.8, length: 2.4 }

export interface Area {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface ZoneAreas {
  lounge: Area
  meeting: Area
  cafe: Area
  storage: Area
}

export function islandOrigin(island: number, islandsPerRow: number): Vec3 {
  const row = Math.floor(island / islandsPerRow)
  const col = island % islandsPerRow
  return [col * ISLAND_PITCH_X, 0, -row * ISLAND_PITCH_Z]
}

// Ordre des postes : les deux premiers sous-agents s'assoient face a face, au plus pres du lead.
const BENCH_SLOTS: { x: number; front: boolean }[] = [
  { x: BENCH_PITCH_X / 2, front: true },
  { x: BENCH_PITCH_X / 2, front: false },
  { x: -BENCH_PITCH_X / 2, front: true },
  { x: -BENCH_PITCH_X / 2, front: false }
]

export function stationFor(deskId: number, islandsPerRow: number): Station {
  const { kind, island, seat } = deskLocation(deskId)
  const [originX, , originZ] = islandOrigin(island, islandsPerRow)
  const frontLane = originZ + LANE_FROM_ISLAND
  if (kind === 'lead') {
    return {
      kind,
      position: [originX + LEAD_X, 0, originZ],
      rotationY: LEAD_ROTATION,
      lane: frontLane
    }
  }
  const slot = BENCH_SLOTS[seat]
  return slot.front
    ? {
        kind,
        position: [originX + slot.x, 0, originZ + BENCH_DESK_Z],
        rotationY: 0,
        lane: frontLane
      }
    : {
        kind,
        position: [originX + slot.x, 0, originZ - BENCH_DESK_Z],
        rotationY: Math.PI,
        lane: originZ - LANE_FROM_ISLAND
      }
}

// Les murs sont faits de tuiles d'une unite : la piece a toujours des dimensions entieres.
export function roomBounds(islands: number, islandsPerRow: number): RoomBounds {
  const rows = Math.max(1, Math.ceil(islands / islandsPerRow))
  const minX = -ISLAND_HALF_WIDTH - MARGIN.left
  const maxZ = LANE_FROM_ISLAND + MARGIN.front
  const rawMaxX =
    (islandsPerRow - 1) * ISLAND_PITCH_X + ISLAND_RIGHT_REACH + GAP_BEFORE_ZONES + ZONE_STRIP_WIDTH
  const rawMinZ = Math.min(
    -(rows - 1) * ISLAND_PITCH_Z - LANE_FROM_ISLAND - BACK_MARGIN,
    maxZ - MIN_DEPTH
  )
  const width = Math.ceil(rawMaxX - minX)
  const depth = Math.ceil(maxZ - rawMinZ)
  const maxX = minX + width
  const minZ = maxZ - depth
  return { minX, maxX, minZ, maxZ, width, depth, center: [(minX + maxX) / 2, 0, (minZ + maxZ) / 2] }
}

export function zoneAreas(bounds: RoomBounds): ZoneAreas {
  const stripMinX = bounds.maxX - ZONE_STRIP_WIDTH
  const loungeMinZ = bounds.maxZ - LOUNGE_DEPTH
  const door = doorZ(bounds)
  return {
    lounge: { minX: stripMinX, maxX: bounds.maxX, minZ: loungeMinZ, maxZ: bounds.maxZ },
    meeting: {
      minX: stripMinX,
      maxX: bounds.maxX,
      minZ: loungeMinZ - MEETING_DEPTH,
      maxZ: loungeMinZ
    },
    cafe: {
      minX: bounds.minX,
      maxX: bounds.minX + CAFE_WIDTH,
      minZ: bounds.minZ,
      maxZ: bounds.minZ + CAFE_DEPTH
    },
    storage: {
      minX: bounds.minX,
      maxX: bounds.minX + STORAGE.depth,
      minZ: door - STORAGE.fromDoor - STORAGE.length,
      maxZ: door - STORAGE.fromDoor
    }
  }
}

export function doorZ(bounds: RoomBounds): number {
  return bounds.maxZ - 0.5
}

export function toWorld(
  station: Station,
  localX: number,
  localZ: number
): { x: number; z: number } {
  const cos = Math.cos(station.rotationY)
  const sin = Math.sin(station.rotationY)
  return {
    x: round(station.position[0] + localX * cos + localZ * sin),
    z: round(station.position[2] - localX * sin + localZ * cos)
  }
}

// cos(PI) et sin(PI) ne tombent pas pile : sans arrondi, un trajet droit derive d'un cheveu.
function round(value: number): number {
  return Math.round(value * 1e6) / 1e6
}
