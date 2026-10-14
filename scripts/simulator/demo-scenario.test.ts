import { describe, expect, it } from 'vitest'
import { normalizePayload } from '../../src/core/normalize'
import { OfficeStore } from '../../src/core/office'
import type { AgentState } from '../../src/core/types'
import { buildDemoScenario, demoIdentifiers } from './demo-scenario'

const RUN = 'test'
const ids = demoIdentifiers(RUN)
const scenario = buildDemoScenario(RUN)

function replayUntil(untilMs: number): OfficeStore {
  const store = new OfficeStore()
  for (const { atMs, payload } of scenario.filter((entry) => entry.atMs <= untilMs)) {
    const event = normalizePayload(payload, atMs)
    if (event) store.apply(event)
    store.tick(atMs)
  }
  return store
}

function find(store: OfficeStore, id: string): AgentState | undefined {
  return store.snapshot().agents.find((agent) => agent.id === id)
}

function firstTimeOf(predicate: (payload: Record<string, unknown>) => boolean): number {
  const entry = scenario.find(({ payload }) => predicate(payload))
  if (!entry) throw new Error('evenement introuvable dans le scenario')
  return entry.atMs
}

describe('scenario de demo', () => {
  it('est ordonne dans le temps et dure moins de deux minutes', () => {
    const times = scenario.map((entry) => entry.atMs)
    expect(times).toEqual([...times].sort((a, b) => a - b))
    expect(times.at(-1)).toBeLessThan(120_000)
  })

  it('ne produit que des payloads acceptes, sauf l’agent interne volontairement ignore', () => {
    const rejected = scenario.filter(
      ({ payload, atMs }) => normalizePayload(payload, atMs) === null
    )
    expect(rejected.map(({ payload }) => payload['agent_type'])).toEqual([''])
  })

  it('fait travailler deux sous-agents en parallele a cote de leur session', () => {
    const store = replayUntil(
      firstTimeOf(
        (payload) => payload['agent_id'] === ids.coverage && payload['tool_name'] === 'Bash'
      )
    )
    const financement = find(store, ids.financement)
    expect(find(store, ids.cartographer)).toMatchObject({
      label: 'Cartographier les repositories',
      presence: 'present'
    })
    expect(find(store, ids.coverage)).toMatchObject({
      label: 'Analyser la couverture de tests',
      activity: 'terminal'
    })
    expect(Math.floor(find(store, ids.coverage)!.deskId / 4)).toBe(
      Math.floor(financement!.deskId / 4)
    )
  })

  it('fait attendre la session financement pendant le travail de son equipe', () => {
    const firstStop = firstTimeOf(
      (payload) =>
        payload['session_id'] === ids.financement && payload['hook_event_name'] === 'Stop'
    )
    expect(find(replayUntil(firstStop), ids.financement)?.activity).toBe('waitingTeam')
  })

  it('fait apparaitre la session agent-office en cours de route et lui fait lever la main', () => {
    const officeEvents = scenario.filter(({ payload }) => payload['session_id'] === ids.office)
    expect(officeEvents.map(({ payload }) => payload['hook_event_name'])).not.toContain(
      'SessionStart'
    )
    expect(find(replayUntil(officeEvents[0].atMs), ids.office)?.activity).toBe('browsing')

    const permission = firstTimeOf((payload) => payload['hook_event_name'] === 'PermissionRequest')
    expect(find(replayUntil(permission + 2_000), ids.office)).toMatchObject({
      activity: 'waitingInput',
      currentTool: { name: 'Bash', target: 'rm -rf out && npm run build' }
    })
  })

  it('fait partir tout le monde a la fin', () => {
    const store = replayUntil(Infinity)
    expect(store.snapshot().agents.every((agent) => agent.presence === 'leaving')).toBe(true)
  })
})
