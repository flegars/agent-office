import { Furniture } from './Furniture'
import { zoneAreas, type Area, type RoomBounds } from './layout'

// Les modeles Kenney ont leur face avant tournee vers +z : une rotation de PI/2 la tourne vers +x,
// -PI/2 vers -x, PI vers -z.
const FACE_PLUS_X = Math.PI / 2
const FACE_MINUS_X = -Math.PI / 2
const FACE_MINUS_Z = Math.PI
const TABLE_TOP = 0.33
const BAR_TOP = 0.42
const BAR_WIDTH = 0.43
const PARTITION = { height: 0.55, thickness: 0.04, doorway: 0.9, color: '#a9c4d6' }

export function Zones({ bounds }: { bounds: RoomBounds }): React.JSX.Element {
  const zones = zoneAreas(bounds)
  return (
    <group>
      <Lounge area={zones.lounge} />
      <MeetingRoom area={zones.meeting} />
      <Cafe area={zones.cafe} />
      <Storage area={zones.storage} />
    </group>
  )
}

function centerOf(area: Area): [number, number] {
  return [(area.minX + area.maxX) / 2, (area.minZ + area.maxZ) / 2]
}

function FloorPatch({ area, color }: { area: Area; color: string }): React.JSX.Element {
  const [x, z] = centerOf(area)
  return (
    <mesh rotation-x={-Math.PI / 2} position={[x, 0.002, z]} receiveShadow>
      <planeGeometry args={[area.maxX - area.minX, area.maxZ - area.minZ]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}

function Lounge({ area }: { area: Area }): React.JSX.Element {
  const [x, z] = centerOf(area)
  return (
    <group>
      <FloorPatch area={area} color="#b9a78e" />
      <Furniture name="rugRound" position={[x + 0.3, 0.004, z]} />
      <Furniture name="loungeSofa" position={[area.maxX - 0.4, 0, z]} rotationY={FACE_MINUS_X} />
      <Furniture name="tableCoffee" position={[x + 0.3, 0, z]} />
      <Furniture name="loungeChair" position={[x - 0.7, 0, z - 0.45]} rotationY={FACE_PLUS_X} />
      <Furniture name="loungeChair" position={[x - 0.7, 0, z + 0.45]} rotationY={FACE_PLUS_X} />
      <Furniture name="pottedPlant" position={[area.maxX - 0.3, 0, area.maxZ - 0.3]} />
      <Furniture name="pottedPlant" position={[area.maxX - 0.3, 0, area.minZ + 0.35]} />
      <Furniture name="lampSquareFloor" position={[area.minX + 0.4, 0, area.maxZ - 0.4]} />
    </group>
  )
}

function MeetingRoom({ area }: { area: Area }): React.JSX.Element {
  const [x, z] = centerOf(area)
  const width = area.maxX - area.minX
  const depth = area.maxZ - area.minZ
  return (
    <group>
      <FloorPatch area={area} color="#a8b4bd" />
      <Partition from={[area.minX, area.minZ]} to={[area.minX, area.maxZ - PARTITION.doorway]} />
      <Partition from={[area.minX, area.maxZ]} to={[area.maxX, area.maxZ]} />
      <Partition from={[area.minX, area.minZ]} to={[area.maxX, area.minZ]} />
      <Furniture name="table" position={[x, 0, z - 0.225]} />
      <Furniture name="table" position={[x, 0, z + 0.225]} />
      <Furniture name="plantSmall3" position={[x, TABLE_TOP, z]} />
      {[-0.22, 0.22].map((dx) => (
        <group key={dx}>
          <Furniture name="chair" position={[x + dx, 0, z - 0.7]} />
          <Furniture name="chair" position={[x + dx, 0, z + 0.7]} rotationY={FACE_MINUS_Z} />
        </group>
      ))}
      <Furniture name="chair" position={[x - 0.67, 0, z]} rotationY={FACE_PLUS_X} />
      <Furniture name="chair" position={[x + 0.67, 0, z]} rotationY={FACE_MINUS_X} />
      <Furniture
        name="bookcaseClosed"
        position={[area.maxX - 0.2, 0, area.minZ + Math.min(0.6, depth / 4)]}
        rotationY={FACE_MINUS_X}
      />
      <Furniture
        name="pottedPlant"
        position={[area.minX + Math.min(0.4, width / 8), 0, area.minZ + 0.35]}
      />
    </group>
  )
}

function Partition({
  from,
  to
}: {
  from: [number, number]
  to: [number, number]
}): React.JSX.Element {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1])
  const alongX = from[1] === to[1]
  return (
    <mesh
      position={[(from[0] + to[0]) / 2, PARTITION.height / 2, (from[1] + to[1]) / 2]}
      castShadow
    >
      <boxGeometry
        args={
          alongX
            ? [length, PARTITION.height, PARTITION.thickness]
            : [PARTITION.thickness, PARTITION.height, length]
        }
      />
      <meshStandardMaterial color={PARTITION.color} transparent opacity={0.55} roughness={0.2} />
    </mesh>
  )
}

function Cafe({ area }: { area: Area }): React.JSX.Element {
  const counterZ = area.minZ + 0.3
  const firstBarX = area.minX + 1.2
  const bars = [0, 1, 2, 3].map((index) => firstBarX + index * BAR_WIDTH)
  return (
    <group>
      <FloorPatch area={area} color="#d6c7ad" />
      <Furniture name="kitchenFridge" position={[area.minX + 0.6, 0, area.minZ + 0.25]} />
      {bars.map((barX) => (
        <Furniture key={barX} name="kitchenBar" position={[barX, 0, counterZ]} />
      ))}
      <Furniture name="kitchenCoffeeMachine" position={[bars[0], BAR_TOP, counterZ]} />
      <Furniture name="plantSmall1" position={[bars[3], BAR_TOP, counterZ]} />
      {bars.slice(0, 3).map((barX) => (
        <Furniture
          key={barX}
          name="stoolBar"
          position={[barX + BAR_WIDTH / 2, 0, counterZ + 0.5]}
          rotationY={FACE_MINUS_Z}
        />
      ))}
      <Furniture name="trashcan" position={[area.maxX - 0.2, 0, area.minZ + 0.25]} />
    </group>
  )
}

function Storage({ area }: { area: Area }): React.JSX.Element {
  const wallX = area.minX + 0.2
  return (
    <group>
      <Furniture name="coatRackStanding" position={[wallX + 0.1, 0, area.maxZ - 0.2]} />
      <Furniture name="coatRackStanding" position={[wallX + 0.1, 0, area.maxZ - 0.6]} />
      <Furniture
        name="bookcaseClosed"
        position={[wallX, 0, area.maxZ - 1.2]}
        rotationY={FACE_PLUS_X}
      />
      <Furniture
        name="bookcaseClosed"
        position={[wallX, 0, area.maxZ - 1.65]}
        rotationY={FACE_PLUS_X}
      />
      <Furniture name="pottedPlant" position={[wallX + 0.05, 0, area.minZ + 0.3]} />
    </group>
  )
}
