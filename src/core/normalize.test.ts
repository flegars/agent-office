import { describe, expect, it } from 'vitest'
import { normalizePayload, projectName } from './normalize'

const AT = 1_000

function payload(fields: Record<string, unknown>): Record<string, unknown> {
  return { session_id: 'session-1', cwd: '/Users/dev/projects/shop-api', ...fields }
}

describe('normalizePayload', () => {
  it('rejette un payload sans session_id ou sans nom d’evenement', () => {
    expect(normalizePayload({ hook_event_name: 'Stop' }, AT)).toBeNull()
    expect(normalizePayload({ session_id: 's' }, AT)).toBeNull()
    expect(normalizePayload('pas du json objet', AT)).toBeNull()
    expect(normalizePayload(null, AT)).toBeNull()
  })

  it('ignore un evenement inconnu', () => {
    expect(normalizePayload(payload({ hook_event_name: 'PreCompact' }), AT)).toBeNull()
  })

  it('normalise un SessionStart', () => {
    expect(
      normalizePayload(payload({ hook_event_name: 'SessionStart', source: 'startup' }), AT)
    ).toEqual({
      kind: 'sessionStart',
      sessionId: 'session-1',
      cwd: '/Users/dev/projects/shop-api',
      at: AT,
      source: 'startup'
    })
  })

  it('distingue un vrai prompt d’un rapport de sous-agent', () => {
    expect(
      normalizePayload(
        payload({ hook_event_name: 'UserPromptSubmit', prompt: '  corrige le bug  ' }),
        AT
      )
    ).toMatchObject({
      kind: 'prompt',
      prompt: 'corrige le bug'
    })
    expect(
      normalizePayload(
        payload({
          hook_event_name: 'UserPromptSubmit',
          prompt: '<agent-message from="a1eb">\n[Subagent hand-back] rapport'
        }),
        AT
      )
    ).toMatchObject({ kind: 'subagentReport', fromAgentId: 'a1eb' })
  })

  it('tronque un prompt trop long', () => {
    const event = normalizePayload(
      payload({ hook_event_name: 'UserPromptSubmit', prompt: 'x'.repeat(2_000) }),
      AT
    )
    expect(event?.kind === 'prompt' && event.prompt.length).toBe(500)
  })

  it.each([
    ['Read', { file_path: '/src/a.ts' }, '/src/a.ts'],
    ['Edit', { file_path: '/src/b.ts', old_string: 'x' }, '/src/b.ts'],
    ['Grep', { pattern: 'contextBridge', path: 'src' }, 'contextBridge'],
    ['Glob', { pattern: '**/*.tsx' }, '**/*.tsx'],
    ['Bash', { command: 'npm test', description: 'Run tests' }, 'npm test'],
    ['WebFetch', { url: 'https://example.com', prompt: 'resume' }, 'https://example.com'],
    ['WebSearch', { query: 'three.js' }, 'three.js'],
    ['Agent', { description: 'Lister les .tsx', prompt: 'long' }, 'Lister les .tsx'],
    ['TodoWrite', { todos: [] }, null]
  ])('extrait la cible de %s', (toolName, toolInput, target) => {
    expect(
      normalizePayload(
        payload({
          hook_event_name: 'PreToolUse',
          tool_name: toolName,
          tool_use_id: 'toolu_1',
          tool_input: toolInput
        }),
        AT
      )
    ).toMatchObject({ kind: 'toolStart', toolName, toolUseId: 'toolu_1', target, agentId: null })
  })

  it('attribue un appel d’outil au sous-agent qui l’emet', () => {
    expect(
      normalizePayload(
        payload({
          hook_event_name: 'PreToolUse',
          tool_name: 'Read',
          tool_use_id: 'toolu_2',
          tool_input: { file_path: '/x' },
          agent_id: 'a8f7',
          agent_type: 'Explore'
        }),
        AT
      )
    ).toMatchObject({ kind: 'toolStart', agentId: 'a8f7', agentType: 'Explore' })
  })

  it('ignore les agents internes (agent_id sans agent_type)', () => {
    expect(
      normalizePayload(
        payload({ hook_event_name: 'SubagentStop', agent_id: 'acdc', agent_type: '' }),
        AT
      )
    ).toBeNull()
    expect(
      normalizePayload(
        payload({
          hook_event_name: 'PreToolUse',
          tool_name: 'Read',
          tool_use_id: 't',
          agent_id: 'acdc'
        }),
        AT
      )
    ).toBeNull()
  })

  it('recupere l’agentId lance par l’outil Agent et sa description', () => {
    expect(
      normalizePayload(
        payload({
          hook_event_name: 'PostToolUse',
          tool_name: 'Agent',
          tool_use_id: 'toolu_3',
          tool_input: { description: 'Résumer index.ts' },
          tool_response: { agentId: 'a8f7', isAsync: true }
        }),
        AT
      )
    ).toMatchObject({
      kind: 'toolEnd',
      spawnedAgentId: 'a8f7',
      spawnedDescription: 'Résumer index.ts',
      failed: false
    })
  })

  it('marque l’echec d’un outil', () => {
    expect(
      normalizePayload(
        payload({ hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_use_id: 't' }),
        AT
      )
    ).toMatchObject({ kind: 'toolEnd', failed: true, spawnedAgentId: null })
  })

  it('lit notification_type, avec repli sur type', () => {
    expect(
      normalizePayload(
        payload({
          hook_event_name: 'Notification',
          notification_type: 'idle_prompt',
          message: 'm'
        }),
        AT
      )
    ).toMatchObject({ kind: 'notification', notificationType: 'idle_prompt', message: 'm' })
    expect(
      normalizePayload(payload({ hook_event_name: 'Notification', type: 'permission_prompt' }), AT)
    ).toMatchObject({ notificationType: 'permission_prompt', message: null })
  })

  it('liste les sous-agents encore en cours au Stop', () => {
    expect(
      normalizePayload(
        payload({
          hook_event_name: 'Stop',
          background_tasks: [
            { id: 'a1', type: 'subagent', status: 'running' },
            { id: 'a2', type: 'subagent', status: 'completed' },
            { id: 'b1', type: 'shell', status: 'running' }
          ]
        }),
        AT
      )
    ).toMatchObject({ kind: 'stop', runningSubagentIds: ['a1'] })
  })

  it('normalise SubagentStart et SubagentStop', () => {
    expect(
      normalizePayload(
        payload({ hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'Explore' }),
        AT
      )
    ).toMatchObject({ kind: 'subagentStart', agentId: 'a1', agentType: 'Explore' })
    expect(
      normalizePayload(
        payload({ hook_event_name: 'SubagentStop', agent_id: 'a1', agent_type: 'Explore' }),
        AT
      )
    ).toMatchObject({ kind: 'subagentStop', agentId: 'a1' })
  })

  it('accepte un cwd absent', () => {
    expect(normalizePayload({ session_id: 's', hook_event_name: 'Stop' }, AT)).toMatchObject({
      cwd: ''
    })
  })
})

describe('projectName', () => {
  it('prend le dernier segment du cwd', () => {
    expect(projectName('/Users/dev/projects/shop-api')).toBe('shop-api')
    expect(projectName('/Users/dev/projects/shop-api/')).toBe('shop-api')
    expect(projectName('C:\\code\\billing')).toBe('billing')
    expect(projectName('')).toBe('projet inconnu')
  })
})
