import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import type { AgentState } from '../../../core/types'
import { screenFor } from './character/pose'
import { Furniture } from './Furniture'
import { CHAIR_OFFSET_Z, DESK_TOP, type Station } from './layout'
import { isClick, useHoverCursor } from './selection'
import { nameplateTexture, screenTexture } from './textures'

// Les modeles Kenney ont leur face avant (dalle de l'ecran, tiroirs, assise) tournee vers +z :
// le poste se lit donc avec l'occupant cote +z, regardant vers -z.
const BENCH = { screenZ: -0.08, keyboardZ: 0.06 }
// Bureau d'angle recentre : l'encoche ou l'on s'assoit est a x = -0,2 et le grand plateau
// occupe z de -0,49 a -0,09. On le decale pour que l'encoche tombe face a la chaise.
const LEAD = { deskShiftX: 0.2, screenZ: -0.3, keyboardZ: -0.15 }
// Dalle de l'ecran une fois le modele recentre : 1 cm devant son centre, plus un ecart anti-scintillement.
const DISPLAY_FROM_SCREEN = -0.01 + 0.004
const MOUSE_X = 0.22
const NAMEPLATE_ABOVE_DESK = 0.36

interface WorkstationProps {
  station: Station
  occupant: AgentState | undefined
  onSelect: (id: string) => void
}

export function Workstation({ station, occupant, onSelect }: WorkstationProps): React.JSX.Element {
  const seatedOccupant = occupant?.presence === 'present' ? occupant : undefined
  const hover = useHoverCursor()
  const interactions = occupant
    ? {
        onClick: (event: ThreeEvent<MouseEvent>) => {
          if (!isClick(event)) return
          event.stopPropagation()
          onSelect(occupant.id)
        },
        ...hover
      }
    : {}
  const isLead = station.kind === 'lead'
  const { screenZ, keyboardZ } = isLead ? LEAD : BENCH
  return (
    <group position={station.position} rotation-y={station.rotationY} {...interactions}>
      {isLead ? (
        <>
          <Furniture name="deskCorner" position={[LEAD.deskShiftX, 0, 0]} />
          <Furniture name="plantSmall1" position={[0.5, DESK_TOP, 0.25]} />
        </>
      ) : (
        <Furniture name="desk" />
      )}
      <Furniture name="computerScreen" position={[0, DESK_TOP, screenZ]} />
      <Screen
        z={screenZ + DISPLAY_FROM_SCREEN}
        mode={seatedOccupant ? screenFor(seatedOccupant.activity) : 'off'}
      />
      <Furniture name="computerKeyboard" position={[0, DESK_TOP, keyboardZ]} />
      <Furniture name="computerMouse" position={[MOUSE_X, DESK_TOP, keyboardZ]} />
      <Furniture name="chairDesk" position={[0, 0, CHAIR_OFFSET_Z]} rotationY={Math.PI} />
      {occupant && <Nameplate occupant={occupant} z={screenZ} />}
    </group>
  )
}

function Screen({
  z,
  mode
}: {
  z: number
  mode: Parameters<typeof screenTexture>[0]
}): React.JSX.Element {
  return (
    <mesh position={[0, DESK_TOP + 0.185, z]}>
      <planeGeometry args={[0.34, 0.2]} />
      <meshBasicMaterial map={screenTexture(mode)} toneMapped={false} />
    </mesh>
  )
}

// Recto verso : les postes face a face doivent se lire des deux cotes de l'ilot.
function Nameplate({ occupant, z }: { occupant: AgentState; z: number }): React.JSX.Element {
  const isSubagent = occupant.kind === 'subagent'
  const texture = useMemo(
    () =>
      nameplateTexture(
        occupant.label,
        isSubagent ? occupant.agentType : null,
        isSubagent ? '#9b7ff0' : '#d97757'
      ),
    [occupant.label, occupant.agentType, isSubagent]
  )
  useEffect(() => () => texture.dispose(), [texture])
  const opacity = occupant.presence === 'leaving' ? 0.45 : 1

  return (
    <group position={[0, DESK_TOP + NAMEPLATE_ABOVE_DESK, z]}>
      {[0, Math.PI].map((rotation) => (
        <mesh key={rotation} rotation-y={rotation} position-z={rotation === 0 ? 0.002 : -0.002}>
          <planeGeometry args={[0.5, 0.11]} />
          <meshBasicMaterial map={texture} transparent opacity={opacity} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}
