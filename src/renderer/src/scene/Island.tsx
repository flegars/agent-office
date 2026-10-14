import { BENCH_DESK_Z, BENCH_PITCH_X, DESK_TOP, type Vec3 } from './layout'

const DIVIDER_COLOR = '#6f8796'
const DIVIDER_HEIGHT = 0.62
const DIVIDER_THICKNESS = 0.03
const SIDE_PANEL_HEIGHT = 0.2
const SIDE_PANEL_DEPTH = 0.38

// Cloison haute entre les deux rangees d'un ilot, et panneaux bas entre voisins de rangee.
export function IslandDividers({ origin }: { origin: Vec3 }): React.JSX.Element {
  return (
    <group position={origin}>
      <mesh position={[0, DIVIDER_HEIGHT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[2 * BENCH_PITCH_X, DIVIDER_HEIGHT, DIVIDER_THICKNESS]} />
        <meshStandardMaterial color={DIVIDER_COLOR} roughness={0.9} />
      </mesh>
      {[BENCH_DESK_Z, -BENCH_DESK_Z].map((z) => (
        <mesh key={z} position={[0, DESK_TOP + SIDE_PANEL_HEIGHT / 2, z]} castShadow>
          <boxGeometry args={[DIVIDER_THICKNESS, SIDE_PANEL_HEIGHT, SIDE_PANEL_DEPTH]} />
          <meshStandardMaterial color={DIVIDER_COLOR} roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}
