import { useCallback, useState } from 'react'
import type { AgentState } from '../../../core/types'
import { Character } from './character/Character'
import {
  presentParent,
  presentTeamSize,
  reconcileRoster,
  removeFromRoster,
  type RosterEntry
} from './character/roster'
import { stationFor, type RoomBounds, type Station } from './layout'

interface CharactersProps {
  agents: AgentState[]
  islandsPerRow: number
  bounds: RoomBounds
  selectedId: string | null
  onSelect: (id: string) => void
}

export function Characters({
  agents,
  islandsPerRow,
  bounds,
  selectedId,
  onSelect
}: CharactersProps): React.JSX.Element {
  const [roster, setRoster] = useState<RosterEntry[]>(() => reconcileRoster([], agents))
  const [syncedAgents, setSyncedAgents] = useState(agents)
  if (syncedAgents !== agents) {
    setSyncedAgents(agents)
    setRoster((previous) => reconcileRoster(previous, agents))
  }

  const handleGone = useCallback((id: string) => {
    setRoster((previous) => removeFromRoster(previous, id))
  }, [])

  const stationOf = (agent: AgentState): Station => stationFor(agent.deskId, islandsPerRow)

  return (
    <group>
      {roster.map(({ agent }) => {
        const parent = presentParent(roster, agent)
        return (
          <Character
            key={agent.id}
            agent={agent}
            station={stationOf(agent)}
            parentStation={parent ? stationOf(parent) : null}
            teamSize={presentTeamSize(roster, agent.id)}
            bounds={bounds}
            selected={agent.id === selectedId}
            onSelect={onSelect}
            onGone={handleGone}
          />
        )
      })}
    </group>
  )
}
