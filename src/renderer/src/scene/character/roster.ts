import type { AgentState } from '../../../../core/types'

export interface RosterEntry {
  agent: AgentState
  departed: boolean
}

// Le store retire un agent apres un delai fixe ; son personnage, lui, doit finir de traverser
// la salle avant de disparaitre. On garde donc la derniere version connue jusqu'a sa sortie.
export function reconcileRoster(previous: RosterEntry[], agents: AgentState[]): RosterEntry[] {
  const current = new Map(agents.map((agent) => [agent.id, agent]))
  const kept = previous.map((entry): RosterEntry => {
    const agent = current.get(entry.agent.id)
    if (agent) {
      return { agent, departed: false }
    }
    return { agent: { ...entry.agent, presence: 'leaving' }, departed: true }
  })
  const known = new Set(previous.map((entry) => entry.agent.id))
  const arrivals = agents
    .filter((agent) => !known.has(agent.id) && agent.presence === 'present')
    .map((agent): RosterEntry => ({ agent, departed: false }))
  return [...kept, ...arrivals]
}

export function presentParent(roster: RosterEntry[], agent: AgentState): AgentState | null {
  if (!agent.parentId) return null
  const parent = roster.find((entry) => entry.agent.id === agent.parentId)?.agent
  return parent?.presence === 'present' ? parent : null
}

export function presentTeamSize(roster: RosterEntry[], parentId: string): number {
  return roster.filter(
    (entry) => entry.agent.parentId === parentId && entry.agent.presence === 'present'
  ).length
}

export function removeFromRoster(roster: RosterEntry[], id: string): RosterEntry[] {
  return roster.filter((entry) => entry.agent.id !== id)
}

const CHARACTER_MODELS = [
  'character-female-a',
  'character-male-a',
  'character-female-b',
  'character-male-b',
  'character-female-c',
  'character-male-c',
  'character-female-d',
  'character-male-d',
  'character-female-e',
  'character-male-e',
  'character-female-f',
  'character-male-f'
] as const

export type CharacterModel = (typeof CHARACTER_MODELS)[number]

export function characterModelFor(agentId: string): CharacterModel {
  let hash = 0
  for (const char of agentId) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }
  return CHARACTER_MODELS[hash % CHARACTER_MODELS.length]
}

export function allCharacterModels(): readonly CharacterModel[] {
  return CHARACTER_MODELS
}
