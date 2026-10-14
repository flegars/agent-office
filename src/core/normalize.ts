import { z } from 'zod'
import type { NormalizedEvent } from './types'

const MAX_TARGET_LENGTH = 200
const MAX_PROMPT_LENGTH = 500

const optionalString = z.string().nullish()

const rawPayloadSchema = z.object({
  session_id: z.string().min(1),
  hook_event_name: z.string().min(1),
  cwd: z.string().default(''),
  agent_id: optionalString,
  agent_type: optionalString,
  source: optionalString,
  reason: optionalString,
  prompt: optionalString,
  tool_name: optionalString,
  tool_use_id: optionalString,
  tool_input: z.record(z.string(), z.unknown()).nullish(),
  tool_response: z.unknown().optional(),
  notification_type: optionalString,
  type: optionalString,
  message: optionalString,
  background_tasks: z
    .array(z.object({ id: optionalString, type: optionalString, status: optionalString }).loose())
    .nullish()
})

type RawPayload = z.infer<typeof rawPayloadSchema>

const AGENT_MESSAGE_PATTERN = /^\s*<agent-message from="([^"]*)"/

const TARGET_FIELDS: Record<string, string[]> = {
  Read: ['file_path'],
  Write: ['file_path'],
  Edit: ['file_path'],
  MultiEdit: ['file_path'],
  NotebookEdit: ['notebook_path'],
  Grep: ['pattern'],
  Glob: ['pattern'],
  Bash: ['command'],
  WebFetch: ['url'],
  WebSearch: ['query'],
  Agent: ['description'],
  Task: ['description'],
  Skill: ['skill']
}

export function normalizePayload(raw: unknown, at: number): NormalizedEvent | null {
  const parsed = rawPayloadSchema.safeParse(raw)
  if (!parsed.success) {
    return null
  }
  const payload = parsed.data
  if (isInternalAgent(payload)) {
    return null
  }

  const base = { sessionId: payload.session_id, cwd: payload.cwd, at }
  const agentId = payload.agent_id ?? null
  const agentType = payload.agent_type ?? null

  switch (payload.hook_event_name) {
    case 'SessionStart':
      return { ...base, kind: 'sessionStart', source: payload.source ?? null }
    case 'SessionEnd':
      return { ...base, kind: 'sessionEnd', reason: payload.reason ?? null }
    case 'UserPromptSubmit':
      return promptEvent(base, payload.prompt ?? '')
    case 'PreToolUse':
      if (!payload.tool_name || !payload.tool_use_id) return null
      return {
        ...base,
        kind: 'toolStart',
        agentId,
        agentType,
        toolName: payload.tool_name,
        toolUseId: payload.tool_use_id,
        target: toolTarget(payload.tool_name, payload.tool_input)
      }
    case 'PostToolUse':
    case 'PostToolUseFailure':
      if (!payload.tool_name || !payload.tool_use_id) return null
      return {
        ...base,
        kind: 'toolEnd',
        agentId,
        agentType,
        toolName: payload.tool_name,
        toolUseId: payload.tool_use_id,
        failed: payload.hook_event_name === 'PostToolUseFailure',
        ...spawnedAgent(payload)
      }
    case 'PermissionRequest':
      return {
        ...base,
        kind: 'permissionRequest',
        agentId,
        agentType,
        toolName: payload.tool_name ?? 'outil inconnu',
        target: payload.tool_name ? toolTarget(payload.tool_name, payload.tool_input) : null
      }
    case 'Notification':
      return {
        ...base,
        kind: 'notification',
        notificationType: payload.notification_type ?? payload.type ?? null,
        message: payload.message ? truncate(payload.message, MAX_TARGET_LENGTH) : null
      }
    case 'Stop':
      return { ...base, kind: 'stop', runningSubagentIds: runningSubagentIds(payload) }
    case 'SubagentStart':
    case 'SubagentStop':
      if (!agentId || !agentType) return null
      return {
        ...base,
        kind: payload.hook_event_name === 'SubagentStart' ? 'subagentStart' : 'subagentStop',
        agentId,
        agentType
      }
    default:
      return null
  }
}

export function projectName(cwd: string): string {
  const segments = cwd.split(/[\\/]/).filter((segment) => segment.length > 0)
  return segments.at(-1) ?? 'projet inconnu'
}

// Claude Code lance des agents internes (suggestion de prompt, titrage...) : ils emettent
// un agent_id avec un agent_type vide et n'ont jamais de SubagentStart.
function isInternalAgent(payload: RawPayload): boolean {
  return Boolean(payload.agent_id) && !payload.agent_type
}

function promptEvent(
  base: { sessionId: string; cwd: string; at: number },
  prompt: string
): NormalizedEvent {
  const agentMessage = AGENT_MESSAGE_PATTERN.exec(prompt)
  if (agentMessage) {
    return { ...base, kind: 'subagentReport', fromAgentId: agentMessage[1] || null }
  }
  return { ...base, kind: 'prompt', prompt: truncate(prompt.trim(), MAX_PROMPT_LENGTH) }
}

function toolTarget(
  toolName: string,
  input: Record<string, unknown> | null | undefined
): string | null {
  if (!input) return null
  const fields = TARGET_FIELDS[toolName] ?? []
  for (const field of fields) {
    const value = input[field]
    if (typeof value === 'string' && value.length > 0) {
      return truncate(value, MAX_TARGET_LENGTH)
    }
  }
  return null
}

function spawnedAgent(payload: RawPayload): {
  spawnedAgentId: string | null
  spawnedDescription: string | null
} {
  const response = payload.tool_response
  const agentId =
    typeof response === 'object' && response !== null && 'agentId' in response
      ? response.agentId
      : null
  if (typeof agentId !== 'string' || agentId.length === 0) {
    return { spawnedAgentId: null, spawnedDescription: null }
  }
  return {
    spawnedAgentId: agentId,
    spawnedDescription: toolTarget('Agent', payload.tool_input)
  }
}

function runningSubagentIds(payload: RawPayload): string[] {
  return (payload.background_tasks ?? []).flatMap((task) =>
    task.type === 'subagent' && task.status === 'running' && task.id ? [task.id] : []
  )
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}
