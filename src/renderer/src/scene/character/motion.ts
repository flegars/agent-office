import {
  CHAIR_OFFSET_Z,
  doorZ,
  STAND_UP_DISTANCE,
  toWorld,
  type RoomBounds,
  type Station
} from '../layout'

export interface Point {
  x: number
  z: number
}

export type Phase = 'walkingIn' | 'seated' | 'walkingOut' | 'gone'

// Arret en cours de route (rapport au parent) : a `at` metres du depart, pendant `seconds`.
export interface Pause {
  at: number
  seconds: number
  heading: number
  waited: number
}

export interface Motion {
  phase: Phase
  path: Point[]
  travelled: number
  pause: Pause | null
  seatedHeading: number
}

export interface Placement {
  x: number
  z: number
  heading: number
}

export const WALK_SPEED = 1.3
export const REPORT_SECONDS = 2.7
const OUTSIDE_DOOR_DISTANCE = 0.8
const AISLE_FROM_WALL = 1.1
const BESIDE_PARENT = 0.55

// Trajet d'un point jusqu'au couloir qu'il dessert ; le dernier point est sur ce couloir.
interface Leg {
  points: Point[]
  lane: number
}

export function seatPoint(station: Station): Point {
  return toWorld(station, 0, CHAIR_OFFSET_Z)
}

export function seatedHeading(station: Station): number {
  return station.rotationY + Math.PI
}

export function arrivalPath(bounds: RoomBounds, station: Station): Point[] {
  return route(bounds, doorLeg(bounds), seatLeg(station))
}

export function startArrival(bounds: RoomBounds, station: Station): Motion {
  return {
    phase: 'walkingIn',
    path: arrivalPath(bounds, station),
    travelled: 0,
    pause: null,
    seatedHeading: seatedHeading(station)
  }
}

// On se poste a cote de la chaise du parent, cote couloir, pour ne jamais traverser son bureau.
export function reportPoint(parentStation: Station): Point {
  const seat = seatPoint(parentStation)
  return { x: seat.x, z: seat.z + Math.sign(parentStation.lane - seat.z) * BESIDE_PARENT }
}

export function reportingPath(
  bounds: RoomBounds,
  station: Station,
  parentStation: Station
): Point[] {
  const stand = standLeg(parentStation)
  return [
    ...route(bounds, seatLeg(station), stand),
    ...route(bounds, stand, doorLeg(bounds)).slice(1)
  ]
}

export function pathLength(path: Point[]): number {
  let length = 0
  for (let index = 1; index < path.length; index++) {
    length += distance(path[index - 1], path[index])
  }
  return length
}

export function placementAlong(path: Point[], travelled: number, fallbackHeading = 0): Placement {
  let remaining = Math.max(0, travelled)
  for (let index = 1; index < path.length; index++) {
    const from = path[index - 1]
    const to = path[index]
    const segment = distance(from, to)
    if (segment > 0 && remaining <= segment) {
      const ratio = remaining / segment
      return {
        x: from.x + (to.x - from.x) * ratio,
        z: from.z + (to.z - from.z) * ratio,
        heading: headingBetween(from, to)
      }
    }
    remaining -= segment
  }
  const last = path[path.length - 1]
  const beforeLast = path[path.length - 2]
  return { ...last, heading: beforeLast ? headingBetween(beforeLast, last) : fallbackHeading }
}

export function advance(motion: Motion, seconds: number): Motion {
  if (motion.phase === 'seated' || motion.phase === 'gone') {
    return motion
  }
  let travelled = motion.travelled + seconds * WALK_SPEED
  let pause = motion.pause
  if (pause && pause.waited < pause.seconds && travelled >= pause.at) {
    const available = pause.waited + (travelled - pause.at) / WALK_SPEED
    const waited = Math.min(pause.seconds, available)
    travelled = pause.at + (available - waited) * WALK_SPEED
    pause = { ...pause, waited }
  }
  if (travelled < pathLength(motion.path)) {
    return { ...motion, travelled, pause }
  }
  if (motion.phase === 'walkingIn') {
    return {
      ...motion,
      phase: 'seated',
      path: [motion.path[motion.path.length - 1]],
      travelled: 0,
      pause: null
    }
  }
  return { ...motion, phase: 'gone', travelled, pause }
}

// Un sous-agent assis passe rendre son rapport a cote de son parent avant de sortir.
export function leave(
  motion: Motion,
  bounds: RoomBounds,
  station: Station,
  parentStation: Station | null = null
): Motion {
  if (motion.phase === 'walkingOut' || motion.phase === 'gone') {
    return motion
  }
  if (motion.phase !== 'seated') {
    return {
      ...motion,
      phase: 'walkingOut',
      path: retrace(motion.path, motion.travelled),
      travelled: 0,
      pause: null
    }
  }
  if (!parentStation) {
    return {
      ...motion,
      phase: 'walkingOut',
      path: route(bounds, seatLeg(station), doorLeg(bounds)),
      travelled: 0,
      pause: null
    }
  }
  const path = reportingPath(bounds, station, parentStation)
  const stand = reportPoint(parentStation)
  const toStand = path.findIndex((point) => point.x === stand.x && point.z === stand.z)
  return {
    ...motion,
    phase: 'walkingOut',
    path,
    travelled: 0,
    pause: {
      at: pathLength(path.slice(0, toStand + 1)),
      seconds: REPORT_SECONDS,
      heading: headingBetween(stand, seatPoint(parentStation)),
      waited: 0
    }
  }
}

export function comeBack(motion: Motion): Motion {
  if (motion.phase !== 'walkingOut') {
    return motion
  }
  return {
    ...motion,
    phase: 'walkingIn',
    path: retrace(motion.path, motion.travelled),
    travelled: 0,
    pause: null
  }
}

export function placementOf(motion: Motion): Placement {
  if (motion.phase === 'seated') {
    return { ...motion.path[0], heading: motion.seatedHeading }
  }
  const placement = placementAlong(motion.path, motion.travelled, motion.seatedHeading)
  const reporting = reportElapsed(motion)
  return reporting === null ? placement : { ...placement, heading: motion.pause!.heading }
}

export function reportElapsed(motion: Motion): number | null {
  const pause = motion.pause
  if (motion.phase !== 'walkingOut' || !pause) return null
  if (motion.travelled < pause.at || pause.waited >= pause.seconds) return null
  return pause.waited
}

function seatLeg(station: Station): Leg {
  const seat = seatPoint(station)
  const standing = toWorld(station, 0, CHAIR_OFFSET_Z + STAND_UP_DISTANCE)
  return {
    points: dedupe([seat, standing, { x: standing.x, z: station.lane }]),
    lane: station.lane
  }
}

function standLeg(parentStation: Station): Leg {
  const stand = reportPoint(parentStation)
  return {
    points: dedupe([stand, { x: stand.x, z: parentStation.lane }]),
    lane: parentStation.lane
  }
}

function doorLeg(bounds: RoomBounds): Leg {
  const lane = doorZ(bounds)
  return { points: [{ x: bounds.minX - OUTSIDE_DOOR_DISTANCE, z: lane }], lane }
}

// On longe le couloir de depart jusqu'a l'allee de la porte, puis le couloir d'arrivee :
// les couloirs passent entre les ilots, on ne traverse jamais un bureau.
function route(bounds: RoomBounds, from: Leg, to: Leg): Point[] {
  const aisleX = bounds.minX + AISLE_FROM_WALL
  const between =
    from.lane === to.lane
      ? []
      : [
          { x: aisleX, z: from.lane },
          { x: aisleX, z: to.lane }
        ]
  return dedupe([...from.points, ...between, ...[...to.points].reverse()])
}

function dedupe(points: Point[]): Point[] {
  return points.filter(
    (point, index) =>
      index === 0 || point.x !== points[index - 1].x || point.z !== points[index - 1].z
  )
}

// Demi-tour en cours de route : on repart du point courant en repassant par les points deja franchis.
function retrace(path: Point[], travelled: number): Point[] {
  const current = placementAlong(path, travelled)
  const passed: Point[] = []
  let covered = 0
  for (let index = 0; index < path.length; index++) {
    if (index > 0) covered += distance(path[index - 1], path[index])
    if (covered <= travelled) passed.push(path[index])
  }
  return [{ x: current.x, z: current.z }, ...passed.reverse()]
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.z - a.z)
}

function headingBetween(from: Point, to: Point): number {
  return Math.atan2(to.x - from.x, to.z - from.z)
}
