import { describe, expect, it } from 'vitest'
import type { AgentState } from '../../../core/types'
import { formatAge, kindLabel, relativesOf, shortId, statusLabel } from './inspection'

function agent(fields: Partial<AgentState> & Pick<AgentState, 'id'>): AgentState {
  return {
    kind: 'session',
    sessionId: fields.id,
    parentId: null,
    agentType: null,
    label: fields.id,
    project: 'p',
    cwd: '/p',
    deskId: 0,
    activity: 'typing',
    presence: 'present',
    currentTool: null,
    lastPrompt: null,
    lastEventAt: 0,
    leftAt: null,
    history: [],
    ...fields
  }
}

describe('statusLabel', () => {
  it('decrit l’activite d’un agent present', () => {
    expect(statusLabel(agent({ id: 's' }), true)).toBe('⌨️ tape')
  })

  it('signale un agent sur le depart puis parti', () => {
    const leaving = agent({ id: 's', presence: 'leaving' })
    expect(statusLabel(leaving, true)).toBe('👋 s’en va')
    expect(statusLabel(leaving, false)).toBe('🚪 a quitté le bureau')
  })
})

describe('kindLabel', () => {
  it('distingue session et sous-agent type', () => {
    expect(kindLabel(agent({ id: 's' }))).toBe('Session Claude Code')
    expect(kindLabel(agent({ id: 'a', kind: 'subagent', agentType: 'Explore' }))).toBe(
      'Sous-agent · Explore'
    )
  })
})

describe('formatAge', () => {
  it('passe des secondes aux minutes puis aux heures', () => {
    expect(formatAge(12_400)).toBe('il y a 12 s')
    expect(formatAge(125_000)).toBe('il y a 2 min')
    expect(formatAge(2 * 3_600_000 + 5)).toBe('il y a 2 h')
    expect(formatAge(-500)).toBe('il y a 0 s')
  })
})

describe('shortId', () => {
  it('abrege les identifiants longs seulement', () => {
    expect(shortId('3f2c9a10-1111-2222-3333-444455556666')).toBe('3f2c9a10…')
    expect(shortId('a1b2')).toBe('a1b2')
  })
})

describe('relativesOf', () => {
  const session = agent({ id: 's' })
  const helperA = agent({ id: 'a', kind: 'subagent', sessionId: 's', parentId: 's' })
  const helperB = agent({ id: 'b', kind: 'subagent', sessionId: 's', parentId: 's' })
  const stranger = agent({ id: 'x' })
  const agents = [session, helperA, stranger, helperB]

  it('liste l’equipe d’une session', () => {
    expect(relativesOf(agents, session)).toEqual({ parent: null, team: [helperA, helperB] })
  })

  it('retrouve le parent d’un sous-agent', () => {
    expect(relativesOf(agents, helperA)).toEqual({ parent: session, team: [] })
  })

  it('tolere un parent deja sorti du bureau', () => {
    expect(relativesOf([helperA], helperA).parent).toBeNull()
  })
})
