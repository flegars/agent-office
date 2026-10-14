import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizePayload } from './normalize'
import { OfficeStore } from './office'
import type { AgentState } from './types'

const SESSION = 'session-1'
const CWD = '/Users/dev/projects/shop-api'

function feed(store: OfficeStore, at: number, fields: Record<string, unknown>): boolean {
  const event = normalizePayload({ session_id: SESSION, cwd: CWD, ...fields }, at)
  if (!event) throw new Error(`payload ignore : ${JSON.stringify(fields)}`)
  return store.apply(event)
}

function agent(store: OfficeStore, id: string): AgentState | undefined {
  return store.snapshot().agents.find((candidate) => candidate.id === id)
}

function toolStart(
  toolName: string,
  toolUseId: string,
  toolInput: Record<string, unknown> = {},
  subagent?: { id: string; type: string }
): Record<string, unknown> {
  return {
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_use_id: toolUseId,
    tool_input: toolInput,
    ...(subagent ? { agent_id: subagent.id, agent_type: subagent.type } : {})
  }
}

function toolEnd(
  toolName: string,
  toolUseId: string,
  subagent?: { id: string; type: string }
): Record<string, unknown> {
  return { ...toolStart(toolName, toolUseId, {}, subagent), hook_event_name: 'PostToolUse' }
}

describe('OfficeStore', () => {
  it('cree une session a son premier evenement, meme sans SessionStart', () => {
    const store = new OfficeStore()
    feed(store, 10, toolStart('Read', 't1', { file_path: '/src/a.ts' }))
    expect(agent(store, SESSION)).toMatchObject({
      kind: 'session',
      label: 'shop-api',
      project: 'shop-api',
      deskId: 0,
      activity: 'reading',
      currentTool: { name: 'Read', target: '/src/a.ts', toolUseId: 't1' }
    })
  })

  it('suit le cycle prompt -> outils -> fin de tour', () => {
    const store = new OfficeStore()
    feed(store, 1, { hook_event_name: 'SessionStart', source: 'startup' })
    expect(agent(store, SESSION)?.activity).toBe('idle')

    feed(store, 2, { hook_event_name: 'UserPromptSubmit', prompt: 'ajoute un test' })
    expect(agent(store, SESSION)).toMatchObject({
      activity: 'thinking',
      lastPrompt: 'ajoute un test'
    })

    feed(store, 3, toolStart('Edit', 't1', { file_path: '/src/a.ts' }))
    expect(agent(store, SESSION)?.activity).toBe('typing')
    feed(store, 4, toolEnd('Edit', 't1'))
    expect(agent(store, SESSION)).toMatchObject({ activity: 'thinking', currentTool: null })

    feed(store, 5, toolStart('Bash', 't2', { command: 'npm test' }))
    expect(agent(store, SESSION)?.activity).toBe('terminal')
    feed(store, 6, toolStart('WebSearch', 't3', { query: 'vitest' }))
    expect(agent(store, SESSION)?.activity).toBe('browsing')

    feed(store, 7, { hook_event_name: 'Stop' })
    expect(agent(store, SESSION)).toMatchObject({ activity: 'idle', currentTool: null })
  })

  it('ignore un PreToolUse qui arrive apres son PostToolUse', () => {
    const store = new OfficeStore()
    feed(store, 1, { hook_event_name: 'UserPromptSubmit', prompt: 'go' })
    feed(store, 2, toolEnd('Bash', 't1'))
    feed(store, 3, toolStart('Bash', 't1', { command: 'ls' }))
    expect(agent(store, SESSION)).toMatchObject({ activity: 'thinking', currentTool: null })
    expect(agent(store, SESSION)?.history.at(-1)).toMatchObject({
      event: 'Outil',
      detail: 'Bash · ls'
    })
  })

  it('leve la main sur une demande de permission puis reprend apres l’outil', () => {
    const store = new OfficeStore()
    feed(store, 1, toolStart('Bash', 't1', { command: 'rm -rf dist' }))
    feed(store, 2, {
      hook_event_name: 'PermissionRequest',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf dist' }
    })
    expect(agent(store, SESSION)?.activity).toBe('waitingInput')
    feed(store, 3, {
      hook_event_name: 'Notification',
      notification_type: 'permission_prompt',
      message: 'needs permission'
    })
    expect(agent(store, SESSION)?.activity).toBe('waitingInput')
    feed(store, 4, toolEnd('Bash', 't1'))
    expect(agent(store, SESSION)?.activity).toBe('thinking')
  })

  it('leve la main sur une notification de permission seule', () => {
    const store = new OfficeStore()
    feed(store, 1, {
      hook_event_name: 'Notification',
      notification_type: 'permission_prompt',
      message: 'm'
    })
    expect(agent(store, SESSION)?.activity).toBe('waitingInput')
  })

  it('installe un sous-agent au bureau voisin, lui attribue ses outils, puis le fait partir', () => {
    const store = new OfficeStore()
    const explore = { id: 'a1', type: 'Explore' }
    feed(store, 1, { hook_event_name: 'UserPromptSubmit', prompt: 'explore' })
    feed(store, 2, toolStart('Agent', 'spawn', { description: 'Lister les .tsx' }))
    feed(store, 3, { hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'Explore' })
    feed(store, 4, {
      hook_event_name: 'PostToolUse',
      tool_name: 'Agent',
      tool_use_id: 'spawn',
      tool_input: { description: 'Lister les .tsx' },
      tool_response: { agentId: 'a1', isAsync: true }
    })
    expect(agent(store, 'a1')).toMatchObject({
      kind: 'subagent',
      parentId: SESSION,
      agentType: 'Explore',
      label: 'Lister les .tsx',
      deskId: 1,
      presence: 'present'
    })

    feed(store, 5, toolStart('Glob', 't1', { pattern: '**/*.tsx' }, explore))
    expect(agent(store, 'a1')?.activity).toBe('reading')
    expect(agent(store, SESSION)?.activity).toBe('thinking')

    feed(store, 6, toolStart('SubagentHandback', 't2', {}, explore))
    expect(agent(store, 'a1')?.activity).toBe('reporting')

    feed(store, 7, { hook_event_name: 'SubagentStop', agent_id: 'a1', agent_type: 'Explore' })
    expect(agent(store, 'a1')).toMatchObject({ presence: 'leaving', leftAt: 7 })
  })

  it('libere le bureau du sous-agent apres l’animation de depart', () => {
    const store = new OfficeStore({ leaveAnimationMs: 100 })
    feed(store, 0, { hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'Explore' })
    feed(store, 10, { hook_event_name: 'SubagentStop', agent_id: 'a1', agent_type: 'Explore' })
    expect(store.tick(50)).toBe(false)
    expect(store.tick(110)).toBe(true)
    expect(agent(store, 'a1')).toBeUndefined()
    expect(store.snapshot().desks.find((desk) => desk.id === 1)?.occupantId).toBeNull()
  })

  it('ne ressuscite pas un sous-agent termine sur un evenement tardif', () => {
    const store = new OfficeStore()
    const explore = { id: 'a1', type: 'Explore' }
    feed(store, 1, { hook_event_name: 'SubagentStop', agent_id: 'a1', agent_type: 'Explore' })
    expect(
      feed(store, 2, { hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'Explore' })
    ).toBe(false)
    expect(feed(store, 3, toolEnd('SubagentHandback', 't', explore))).toBe(false)
    expect(agent(store, 'a1')).toBeUndefined()
  })

  it('cree a la volee un sous-agent deja en cours au lancement de l’app', () => {
    const store = new OfficeStore()
    feed(store, 1, toolStart('Read', 't1', { file_path: '/x' }, { id: 'a9', type: 'Plan' }))
    expect(agent(store, SESSION)).toBeDefined()
    expect(agent(store, 'a9')).toMatchObject({
      parentId: SESSION,
      label: 'Plan',
      activity: 'reading'
    })
  })

  it('fait attendre la session tant que ses sous-agents travaillent', () => {
    const store = new OfficeStore()
    feed(store, 1, { hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'Explore' })
    feed(store, 2, { hook_event_name: 'SubagentStart', agent_id: 'a2', agent_type: 'Explore' })
    feed(store, 3, {
      hook_event_name: 'Stop',
      background_tasks: [
        { id: 'a1', type: 'subagent', status: 'running' },
        { id: 'a2', type: 'subagent', status: 'running' }
      ]
    })
    expect(agent(store, SESSION)?.activity).toBe('waitingTeam')
    feed(store, 4, { hook_event_name: 'SubagentStop', agent_id: 'a1', agent_type: 'Explore' })
    expect(agent(store, SESSION)?.activity).toBe('waitingTeam')
    feed(store, 5, { hook_event_name: 'SubagentStop', agent_id: 'a2', agent_type: 'Explore' })
    expect(agent(store, SESSION)?.activity).toBe('idle')
  })

  it('renvoie les sous-agents oublies quand le Stop ne les liste plus', () => {
    const store = new OfficeStore()
    feed(store, 1, { hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'Explore' })
    feed(store, 2, { hook_event_name: 'Stop', background_tasks: [] })
    expect(agent(store, 'a1')?.presence).toBe('leaving')
    expect(agent(store, SESSION)?.activity).toBe('idle')
  })

  it('ne prend pas un rapport de sous-agent pour un prompt', () => {
    const store = new OfficeStore()
    feed(store, 1, { hook_event_name: 'UserPromptSubmit', prompt: 'vrai prompt' })
    feed(store, 2, {
      hook_event_name: 'UserPromptSubmit',
      prompt: '<agent-message from="a1">\nrapport'
    })
    expect(agent(store, SESSION)).toMatchObject({ lastPrompt: 'vrai prompt', activity: 'thinking' })
    expect(agent(store, SESSION)?.history.at(-1)).toMatchObject({
      event: 'Rapport reçu',
      detail: 'a1'
    })
  })

  it('fait partir la session et ses sous-agents au SessionEnd, puis ignore les evenements tardifs', () => {
    const store = new OfficeStore()
    feed(store, 1, { hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'Explore' })
    feed(store, 2, { hook_event_name: 'SessionEnd', reason: 'prompt_input_exit' })
    expect(agent(store, SESSION)?.presence).toBe('leaving')
    expect(agent(store, 'a1')?.presence).toBe('leaving')
    expect(feed(store, 3, { hook_event_name: 'Stop' })).toBe(false)
  })

  it('accueille de nouveau une session reprise apres son SessionEnd', () => {
    const store = new OfficeStore()
    feed(store, 1, { hook_event_name: 'SessionEnd', reason: 'other' })
    feed(store, 2, { hook_event_name: 'SessionStart', source: 'resume' })
    expect(agent(store, SESSION)?.presence).toBe('present')
  })

  it('fait partir une session inactive, puis la fait revenir a son prochain evenement', () => {
    const store = new OfficeStore({ inactivityMs: 1_000, leaveAnimationMs: 10_000 })
    feed(store, 0, { hook_event_name: 'Stop' })
    expect(store.tick(999)).toBe(false)
    expect(store.tick(1_000)).toBe(true)
    expect(agent(store, SESSION)?.presence).toBe('leaving')
    feed(store, 1_500, { hook_event_name: 'UserPromptSubmit', prompt: 'je reviens' })
    expect(agent(store, SESSION)).toMatchObject({
      presence: 'present',
      leftAt: null,
      activity: 'thinking'
    })
  })

  it('maintient la session active tant que ses sous-agents travaillent', () => {
    const store = new OfficeStore({ inactivityMs: 1_000 })
    feed(store, 0, { hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'Explore' })
    feed(store, 900, toolStart('Read', 't1', {}, { id: 'a1', type: 'Explore' }))
    store.tick(1_200)
    expect(agent(store, SESSION)?.presence).toBe('present')
  })

  it('borne l’historique de chaque agent', () => {
    const store = new OfficeStore({ historyLimit: 3 })
    for (let i = 0; i < 10; i++) {
      feed(store, i, { hook_event_name: 'UserPromptSubmit', prompt: `prompt ${i}` })
    }
    expect(agent(store, SESSION)?.history.map((entry) => entry.detail)).toEqual([
      'prompt 7',
      'prompt 8',
      'prompt 9'
    ])
  })

  it('donne a chaque session le bureau de lead d’un ilot et agrandit la salle', () => {
    const store = new OfficeStore()
    for (const id of ['s1', 's2', 's3']) {
      store.apply({ kind: 'stop', sessionId: id, cwd: `/p/${id}`, at: 1, runningSubagentIds: [] })
    }
    const snapshot = store.snapshot()
    const deskOf = (id: string) =>
      snapshot.desks.find((desk) => desk.id === snapshot.agents.find((a) => a.id === id)?.deskId)
    expect(['s1', 's2', 's3'].map((id) => [deskOf(id)?.kind, deskOf(id)?.island])).toEqual([
      ['lead', 0],
      ['lead', 1],
      ['lead', 2]
    ])
    expect(snapshot.islands).toBe(3)
  })

  it('installe les sous-agents dans l’ilot de leur session', () => {
    const store = new OfficeStore()
    feed(store, 1, { hook_event_name: 'SessionStart', source: 'startup' })
    feed(store, 2, { hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'Explore' })
    const snapshot = store.snapshot()
    const desk = snapshot.desks.find((d) => d.id === agent(store, 'a1')?.deskId)
    expect(desk).toMatchObject({ kind: 'bench', island: 0, occupantId: 'a1' })
  })

  it('renvoie un snapshot independant de l’etat interne', () => {
    const store = new OfficeStore()
    feed(store, 1, { hook_event_name: 'Stop' })
    store.snapshot().agents[0].label = 'modifie'
    expect(agent(store, SESSION)?.label).toBe('shop-api')
  })
})

describe('historique des sous-agents dans la session', () => {
  it('ne repete pas le type quand la mission n’est pas encore connue', () => {
    const store = new OfficeStore()
    feed(store, 1, { hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'Explore' })
    expect(agent(store, SESSION)?.history.at(-1)).toMatchObject({
      event: 'Sous-agent arrivé',
      detail: 'Explore'
    })
  })

  it('accole la mission au type une fois connue', () => {
    const store = new OfficeStore()
    feed(store, 1, { hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'Explore' })
    feed(store, 2, {
      ...toolStart('Agent', 't1', { description: 'Cartographier' }),
      hook_event_name: 'PostToolUse',
      tool_response: { agentId: 'a1', isAsync: true }
    })
    feed(store, 3, { hook_event_name: 'SubagentStop', agent_id: 'a1', agent_type: 'Explore' })
    expect(agent(store, SESSION)?.history.at(-1)).toMatchObject({
      event: 'Sous-agent parti',
      detail: 'Explore · Cartographier'
    })
  })
})

describe('OfficeStore rejoue une vraie session capturee', () => {
  const lines = readFileSync(join(__dirname, '__fixtures__/real-session.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown> & { _offset_s: number })

  function replay(until: number): OfficeStore {
    const store = new OfficeStore()
    for (const line of lines.filter((candidate) => candidate._offset_s <= until)) {
      const event = normalizePayload(line, line._offset_s * 1_000)
      if (event) store.apply(event)
    }
    return store
  }

  it('montre les deux sous-agents Explore avec leur description, chacun avec son outil', () => {
    const store = replay(28)
    const subagents = store.snapshot().agents.filter((candidate) => candidate.kind === 'subagent')
    expect(
      subagents.map((candidate) => [
        candidate.label,
        candidate.activity,
        candidate.currentTool?.name
      ])
    ).toEqual([
      ['Lister les .tsx du renderer', 'terminal', 'Bash'],
      ['Résumer src/main/index.ts', 'reading', 'Read']
    ])
  })

  it('n’affiche jamais les agents internes de Claude Code', () => {
    const store = replay(Infinity)
    const ids = store.snapshot().agents.map((candidate) => candidate.id)
    expect(ids).not.toContain('acdc69c053738c519')
    expect(ids).not.toContain('a3b084480d9175585')
  })

  it('fait attendre la session pendant que ses sous-agents finissent', () => {
    expect(agent(replay(34), lines[0].session_id as string)?.activity).toBe('waitingTeam')
  })

  it('termine avec une session au repos et des sous-agents partis', () => {
    const store = replay(Infinity)
    const session = agent(store, lines[0].session_id as string)
    expect(session).toMatchObject({
      activity: 'idle',
      project: 'agent-office',
      presence: 'present'
    })
    expect(
      store
        .snapshot()
        .agents.filter((candidate) => candidate.kind === 'subagent')
        .every((candidate) => candidate.presence === 'leaving')
    ).toBe(true)
  })
})
