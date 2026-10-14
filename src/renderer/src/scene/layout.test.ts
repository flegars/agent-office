import { describe, expect, it } from 'vitest'
import {
  CHAIR_OFFSET_Z,
  doorZ,
  STAND_UP_DISTANCE,
  islandOrigin,
  roomBounds,
  stationFor,
  toWorld,
  zoneAreas,
  type Area,
  type RoomBounds
} from './layout'

const DESKS_PER_ISLAND = 5

describe('stationFor', () => {
  it('place le lead en bout d’ilot, tourne vers son equipe', () => {
    const lead = stationFor(0, 2)
    expect(lead.kind).toBe('lead')
    expect(lead.position[0]).toBeGreaterThan(stationFor(1, 2).position[0])
    expect(toWorld(lead, 0, -1).x).toBeLessThan(lead.position[0])
  })

  it('assoit les deux premiers sous-agents face a face, au plus pres du lead', () => {
    const [first, second] = [stationFor(1, 2), stationFor(2, 2)]
    expect(first.position[0]).toBe(second.position[0])
    expect(first.rotationY).toBe(0)
    expect(second.rotationY).toBe(Math.PI)
    expect(first.position[2]).toBeGreaterThan(second.position[2])
    expect(first.position[0]).toBeGreaterThan(stationFor(3, 2).position[0])
  })

  it('se leve d’un poste d’ilot directement dans le couloir de sa rangee', () => {
    for (const id of [1, 2, 3, 4]) {
      const station = stationFor(id, 2)
      expect(toWorld(station, 0, CHAIR_OFFSET_Z + STAND_UP_DISTANCE).z).toBeCloseTo(station.lane)
    }
  })

  it('fait sortir chaque rangee de l’ilot par son propre couloir', () => {
    const front = stationFor(1, 2)
    const back = stationFor(2, 2)
    expect(front.lane).toBeGreaterThan(front.position[2])
    expect(back.lane).toBeLessThan(back.position[2])
    expect(stationFor(0, 2).lane).toBe(front.lane)
  })

  it('range les ilots deux par deux puis recule d’une rangee', () => {
    expect(islandOrigin(1, 2)[0]).toBeGreaterThan(islandOrigin(0, 2)[0])
    expect(islandOrigin(2, 2)).toEqual([0, 0, expect.any(Number)])
    expect(islandOrigin(2, 2)[2]).toBeLessThan(0)
  })

  it('separe les couloirs de deux rangees d’ilots successives', () => {
    const backOfFirstRow = stationFor(2, 2).lane
    const frontOfSecondRow = stationFor(2 * DESKS_PER_ISLAND + 1, 2).lane
    expect(frontOfSecondRow).toBeLessThan(backOfFirstRow)
    expect(frontOfSecondRow).toBeGreaterThan(stationFor(2 * DESKS_PER_ISLAND, 2).position[2])
  })
})

describe('roomBounds', () => {
  it('a des dimensions entieres pour accueillir les tuiles de mur', () => {
    const bounds = roomBounds(2, 2)
    expect(Number.isInteger(bounds.width)).toBe(true)
    expect(Number.isInteger(bounds.depth)).toBe(true)
  })

  it('contient tous les postes, chaises et couloirs', () => {
    for (const islands of [1, 2, 5]) {
      const bounds = roomBounds(islands, 2)
      for (let id = 0; id < islands * DESKS_PER_ISLAND; id++) {
        const station = stationFor(id, 2)
        const standing = toWorld(station, 0, CHAIR_OFFSET_Z + STAND_UP_DISTANCE)
        expect(standing.x).toBeGreaterThan(bounds.minX)
        expect(standing.x).toBeLessThan(bounds.maxX)
        expect(station.lane).toBeGreaterThan(bounds.minZ)
        expect(station.lane).toBeLessThan(bounds.maxZ)
      }
    }
  })

  it('s’agrandit vers le fond quand une rangee d’ilots apparait, sans bouger l’avant', () => {
    const small = roomBounds(2, 2)
    const large = roomBounds(3, 2)
    expect(large.maxZ).toBe(small.maxZ)
    expect(large.minZ).toBeLessThan(small.minZ)
    expect(large.width).toBe(small.width)
  })
})

describe('zoneAreas', () => {
  const overlaps = (a: Area, b: Area): boolean =>
    a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ
  const inside = (a: Area, bounds: RoomBounds): boolean =>
    a.minX >= bounds.minX && a.maxX <= bounds.maxX && a.minZ >= bounds.minZ && a.maxZ <= bounds.maxZ

  it.each([1, 2, 3, 6])(
    'reste dans la salle sans toucher aux ilots ni aux couloirs (%i ilots)',
    (islands) => {
      const bounds = roomBounds(islands, 2)
      const zones = Object.values(zoneAreas(bounds))
      for (const zone of zones) {
        expect(inside(zone, bounds)).toBe(true)
        for (const other of zones) {
          if (other !== zone) expect(overlaps(zone, other)).toBe(false)
        }
        for (let id = 0; id < islands * DESKS_PER_ISLAND; id++) {
          const station = stationFor(id, 2)
          const seat = toWorld(station, 0, CHAIR_OFFSET_Z + STAND_UP_DISTANCE)
          const reach: Area = {
            minX: Math.min(station.position[0], seat.x) - 0.5,
            maxX: Math.max(station.position[0], seat.x) + 0.5,
            minZ: Math.min(station.position[2], seat.z, station.lane) - 0.3,
            maxZ: Math.max(station.position[2], seat.z, station.lane) + 0.3
          }
          expect(overlaps(zone, reach), `${JSON.stringify(zone)} / bureau ${id}`).toBe(false)
        }
        const aisle: Area = {
          minX: bounds.minX + 0.8,
          maxX: bounds.minX + 1.4,
          minZ: Math.min(
            ...Array.from({ length: islands * DESKS_PER_ISLAND }, (_, id) => stationFor(id, 2).lane)
          ),
          maxZ: doorZ(bounds) + 0.3
        }
        expect(overlaps(zone, aisle), `${JSON.stringify(zone)} / allee`).toBe(false)
      }
    }
  )
})
