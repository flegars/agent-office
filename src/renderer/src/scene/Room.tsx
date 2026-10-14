import { Furniture } from './Furniture'
import type { RoomBounds } from './layout'
import { Zones } from './Zones'

const WALL_THICKNESS = 0.05

export function Room({ bounds }: { bounds: RoomBounds }): React.JSX.Element {
  const [centerX, , centerZ] = bounds.center
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[centerX, 0, centerZ]} receiveShadow>
        <planeGeometry args={[bounds.width, bounds.depth]} />
        <meshStandardMaterial color="#c9b8a0" />
      </mesh>
      <BackWall bounds={bounds} />
      <LeftWall bounds={bounds} />
      <Zones bounds={bounds} />
    </group>
  )
}

function BackWall({ bounds }: { bounds: RoomBounds }): React.JSX.Element {
  return (
    <group>
      {Array.from({ length: bounds.width }, (_, index) => (
        <Furniture
          key={index}
          name={index % 2 === 1 ? 'wallWindow' : 'wall'}
          anchor="corner"
          position={[bounds.minX + index, 0, bounds.minZ + WALL_THICKNESS]}
        />
      ))}
    </group>
  )
}

function LeftWall({ bounds }: { bounds: RoomBounds }): React.JSX.Element {
  return (
    <group>
      {Array.from({ length: bounds.depth }, (_, index) => (
        <Furniture
          key={index}
          name={index === 0 ? 'wallDoorway' : 'wall'}
          anchor="corner"
          rotationY={Math.PI / 2}
          position={[bounds.minX + WALL_THICKNESS, 0, bounds.maxZ - index]}
        />
      ))}
    </group>
  )
}
