import { describe, expect, it } from 'vitest'
import { roomBounds, stationFor, type Station } from '../layout'
import {
  advance,
  arrivalPath,
  comeBack,
  leave,
  pathLength,
  placementAlong,
  placementOf,
  REPORT_SECONDS,
  reportElapsed,
  reportPoint,
  seatedHeading,
  seatPoint,
  startArrival,
  WALK_SPEED,
  type Motion,
  type Point
} from './motion'

const bounds = roomBounds(4, 2)
const lead = stationFor(5, 2)
const frontSeat = stationFor(6, 2)
const backSeat = stationFor(7, 2)
const otherRowSeat = stationFor(12, 2)

function expectAxisAligned(path: Point[]): void {
  for (let index = 1; index < path.length; index++) {
    const sameX = path[index].x === path[index - 1].x
    const sameZ = path[index].z === path[index - 1].z
    expect(sameX || sameZ, JSON.stringify([path[index - 1], path[index]])).toBe(true)
  }
}

// Aucun point de passage ne doit tomber sur un bureau : on teste les points de couloir
// (tous sauf la chaise d'arrivee, deja contre son bureau) contre l'emprise des ilots.
function expectOutsideIslands(path: Point[]): void {
  for (const point of path.slice(1, -1)) {
    for (const island of [0, 1, 2, 3]) {
      const origin = stationFor(island * 5 + 1, 2).position
      const insideX = point.x > origin[0] - 1.2 && point.x < origin[0] + 0.4
      const insideZ = Math.abs(point.z - (origin[2] - 0.22)) < 0.45
      expect(insideX && insideZ, JSON.stringify(point)).toBe(false)
    }
  }
}

const seated = (station: Station): Motion => advance(startArrival(bounds, station), 1_000)

describe('arrivalPath', () => {
  it.each([
    ['lead', lead],
    ['poste avant', frontSeat],
    ['poste arriere', backSeat],
    ['autre rangee', otherRowSeat]
  ])('entre par la porte et finit sur la chaise (%s), en lignes droites', (_, station) => {
    const path = arrivalPath(bounds, station)
    expect(path[0].x).toBeLessThan(bounds.minX)
    expect(path.at(-1)).toEqual(seatPoint(station))
    expectAxisAligned(path)
    expectOutsideIslands(path)
    for (const point of path.slice(1)) {
      expect(point.x).toBeGreaterThan(bounds.minX)
      expect(point.z).toBeGreaterThan(bounds.minZ)
      expect(point.z).toBeLessThan(bounds.maxZ)
    }
  })
})

describe('placementAlong', () => {
  const path = [
    { x: 0, z: 0 },
    { x: 2, z: 0 },
    { x: 2, z: 3 }
  ]

  it('interpole la position et oriente le personnage dans le sens de la marche', () => {
    expect(placementAlong(path, 1)).toEqual({ x: 1, z: 0, heading: Math.PI / 2 })
    expect(placementAlong(path, 3)).toEqual({ x: 2, z: 1, heading: 0 })
  })

  it('reste au bout du chemin au-dela de sa longueur', () => {
    expect(placementAlong(path, 99)).toMatchObject({ x: 2, z: 3 })
    expect(pathLength(path)).toBe(5)
  })
})

describe('cycle arrivee -> assis -> depart', () => {
  it('s’assoit au bout du trajet, tourne vers son bureau', () => {
    let motion = startArrival(bounds, backSeat)
    motion = advance(motion, pathLength(motion.path) / 2 / WALK_SPEED)
    expect(motion.phase).toBe('walkingIn')
    motion = advance(motion, pathLength(motion.path) / WALK_SPEED)
    expect(motion.phase).toBe('seated')
    expect(placementOf(motion)).toEqual({
      ...seatPoint(backSeat),
      heading: seatedHeading(backSeat)
    })
    expect(advance(motion, 10)).toBe(motion)
  })

  it('oriente chaque occupant vers son bureau', () => {
    expect(seatedHeading(frontSeat)).toBeCloseTo(Math.PI)
    expect(seatedHeading(backSeat) % (2 * Math.PI)).toBeCloseTo(0)
    expect(Math.sin(seatedHeading(lead))).toBeCloseTo(-1)
  })

  it('repart vers la porte et disparait dehors', () => {
    let motion = leave(seated(frontSeat), bounds, frontSeat)
    expect(motion.phase).toBe('walkingOut')
    expect(motion.path[0]).toEqual(seatPoint(frontSeat))
    expectAxisAligned(motion.path)
    motion = advance(motion, 1_000)
    expect(motion.phase).toBe('gone')
    expect(placementOf(motion).x).toBeLessThan(bounds.minX)
  })

  it('fait demi-tour depuis sa position courante s’il doit partir en arrivant', () => {
    const arriving = advance(startArrival(bounds, frontSeat), 2)
    const here = placementOf(arriving)
    const leaving = leave(arriving, bounds, frontSeat)
    expect(leaving.path[0]).toEqual({ x: here.x, z: here.z })
    expect(leaving.path.at(-1)).toEqual(arriving.path[0])
  })

  it('revient a son bureau s’il est rappele en partant', () => {
    const leaving = advance(leave(seated(lead), bounds, lead), 1)
    const back = advance(comeBack(leaving), 1_000)
    expect(back.phase).toBe('seated')
    expect(placementOf(back)).toMatchObject(seatPoint(lead))
  })

  it('ignore un rappel quand il n’est pas en train de partir', () => {
    const motion = seated(frontSeat)
    expect(comeBack(motion)).toBe(motion)
  })
})

describe('rapport au lead', () => {
  const stepUntil = (motion: Motion, done: (m: Motion) => boolean): Motion => {
    let current = motion
    for (let frame = 0; frame < 20_000 && !done(current); frame++) {
      current = advance(current, 1 / 60)
    }
    return current
  }

  it.each([
    ['poste avant', frontSeat],
    ['poste arriere', backSeat],
    ['autre rangee', otherRowSeat]
  ])('s’arrete a cote du lead, cote couloir, tourne vers lui (%s)', (_, station) => {
    const leaving = leave(seated(station), bounds, station, lead)
    expectAxisAligned(leaving.path)
    expectOutsideIslands(leaving.path)
    const reporting = stepUntil(leaving, (m) => reportElapsed(m) !== null)
    const here = placementOf(reporting)
    expect(here.x).toBeCloseTo(reportPoint(lead).x)
    expect(here.z).toBeCloseTo(reportPoint(lead).z)
    expect(here.z).toBeGreaterThan(seatPoint(lead).z)
    expect(here.heading).toBeCloseTo(Math.PI)
  })

  it('reste sur place le temps du rapport puis sort par la porte', () => {
    const reporting = stepUntil(
      leave(seated(frontSeat), bounds, frontSeat, lead),
      (m) => reportElapsed(m) !== null
    )
    const stillReporting = advance(reporting, REPORT_SECONDS - 0.2)
    expect(placementOf(stillReporting)).toMatchObject(placementOf(reporting))
    const gone = advance(stillReporting, 1_000)
    expect(gone.phase).toBe('gone')
    expect(placementOf(gone).x).toBeLessThan(bounds.minX)
  })

  it('ne saute pas le rapport meme si une image tres longue le traverse', () => {
    const leaving = leave(seated(frontSeat), bounds, frontSeat, lead)
    const reporting = advance(leaving, leaving.pause!.at / WALK_SPEED + 1)
    expect(reportElapsed(reporting)).toBeCloseTo(1)
  })

  it('ne fait pas de detour s’il part avant d’etre assis', () => {
    const arriving = advance(startArrival(bounds, frontSeat), 1)
    expect(leave(arriving, bounds, frontSeat, lead).pause).toBeNull()
  })

  it('retourne a sa chaise s’il est rappele pendant le rapport', () => {
    const reporting = stepUntil(
      leave(seated(backSeat), bounds, backSeat, lead),
      (m) => reportElapsed(m) !== null
    )
    const back = advance(comeBack(reporting), 1_000)
    expect(back.phase).toBe('seated')
    expect(placementOf(back)).toMatchObject(seatPoint(backSeat))
  })
})
