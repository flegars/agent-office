import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useMemo, useState } from 'react'
import type { OfficeSnapshot } from '../../../core/types'
import { islandOrigin, roomBounds, stationFor, type Vec3 } from './layout'
import { Characters } from './Characters'
import { IslandDividers } from './Island'
import { Room } from './Room'
import { Workstation } from './Workstation'

const CAMERA_OFFSET: Vec3 = [3.5, 5.5, 7.5]

interface OfficeSceneProps {
  office: OfficeSnapshot
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export function OfficeScene({ office, selectedId, onSelect }: OfficeSceneProps): React.JSX.Element {
  const bounds = useMemo(
    () => roomBounds(office.islands, office.islandsPerRow),
    [office.islands, office.islandsPerRow]
  )
  const agentsById = useMemo(
    () => new Map(office.agents.map((agent) => [agent.id, agent])),
    [office.agents]
  )
  const [centerX, , centerZ] = bounds.center
  // La camera ne suit pas l'agrandissement de la salle : seul l'utilisateur la deplace.
  const [initialView] = useState(() => ({
    camera: [centerX + CAMERA_OFFSET[0], CAMERA_OFFSET[1], centerZ + CAMERA_OFFSET[2]] as Vec3,
    target: [centerX, 0, centerZ] as Vec3
  }))

  return (
    <Canvas
      shadows
      camera={{ position: initialView.camera, fov: 45 }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={['#1d2029']} />
      <hemisphereLight args={['#fff6e8', '#4a4f63', 1.1]} />
      <directionalLight
        position={[centerX + 4, 8, centerZ + 5]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
      <Suspense fallback={null}>
        <Room bounds={bounds} />
        {Array.from({ length: office.islands }, (_, island) => (
          <IslandDividers key={island} origin={islandOrigin(island, office.islandsPerRow)} />
        ))}
        {office.desks.map((desk) => (
          <Workstation
            key={desk.id}
            station={stationFor(desk.id, office.islandsPerRow)}
            occupant={desk.occupantId ? agentsById.get(desk.occupantId) : undefined}
            onSelect={onSelect}
          />
        ))}
        <Characters
          agents={office.agents}
          islandsPerRow={office.islandsPerRow}
          bounds={bounds}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      </Suspense>
      <OrbitControls
        target={initialView.target}
        maxPolarAngle={Math.PI / 2.2}
        minDistance={2}
        maxDistance={30}
        enableDamping
        zoomToCursor
      />
    </Canvas>
  )
}
