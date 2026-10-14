import { describe, expect, it } from 'vitest'
import type { AgentState } from '../../../../core/types'
import {
  characterModelFor,
  presentParent,
  presentTeamSize,
  reconcileRoster,
  removeFromRoster
} from './roster'

function agent(id: string, presence: AgentState['presence'] = 'present'): AgentState {
  return {
    id,
    kind: 'session',
    sessionId: id,
    parentId: null,
    agentType: null,
    label: id,
    project: id,
    cwd: `/p/${id}`,
    deskId: 0,
    activity: 'idle',
    presence,
    currentTool: null,
    lastPrompt: null,
    lastEventAt: 0,
    leftAt: null,
    history: []
  }
}

describe('reconcileRoster', () => {
  it('ajoute les nouveaux agents presents', () => {
    expect(reconcileRoster([], [agent('a'), agent('b')]).map((entry) => entry.agent.id)).toEqual([
      'a',
      'b'
    ])
  })

  it('n’accueille pas un agent deja en train de partir', () => {
    expect(reconcileRoster([], [agent('a', 'leaving')])).toEqual([])
  })

  it('garde un agent retire du store, marque comme parti, jusqu’a sa sortie', () => {
    const roster = reconcileRoster([], [agent('a')])
    const next = reconcileRoster(roster, [])
    expect(next).toEqual([{ agent: { ...agent('a'), presence: 'leaving' }, departed: true }])
    expect(removeFromRoster(next, 'a')).toEqual([])
  })

  it('met a jour l’etat des agents connus', () => {
    const roster = reconcileRoster([], [agent('a')])
    const busy = { ...agent('a'), activity: 'typing' as const }
    expect(reconcileRoster(roster, [busy])[0].agent.activity).toBe('typing')
  })
})

describe('characterModelFor', () => {
  it('attribue toujours le meme personnage a un agent', () => {
    expect(characterModelFor('session-42')).toBe(characterModelFor('session-42'))
  })

  it('varie les personnages', () => {
    const models = new Set(Array.from({ length: 40 }, (_, i) => characterModelFor(`s-${i}`)))
    expect(models.size).toBeGreaterThan(6)
  })
})

describe('equipe d’une session', () => {
  const session = agent('s')
  const helper = (id: string, presence: AgentState['presence'] = 'present'): AgentState => ({
    ...agent(id, presence),
    kind: 'subagent',
    sessionId: 's',
    parentId: 's'
  })

  it('retrouve le parent encore present pour le rapport', () => {
    const roster = reconcileRoster([], [session, helper('h')])
    expect(presentParent(roster, roster[1].agent)?.id).toBe('s')
    expect(presentParent(roster, session)).toBeNull()
  })

  it('ignore un parent deja en train de partir', () => {
    const roster = reconcileRoster(reconcileRoster([], [session, helper('h')]), [
      agent('s', 'leaving'),
      helper('h')
    ])
    expect(presentParent(roster, helper('h'))).toBeNull()
  })

  it('ne compte que les sous-agents encore au travail', () => {
    const roster = reconcileRoster(reconcileRoster([], [session, helper('a'), helper('b')]), [
      session,
      helper('a'),
      helper('b', 'leaving')
    ])
    expect(presentTeamSize(roster, 's')).toBe(1)
  })
})
