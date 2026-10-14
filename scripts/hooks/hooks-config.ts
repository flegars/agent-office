export const DEFAULT_PORT = 47821

// Signature reconnue a la desinstallation et a la reinstallation. Un champ JSON maison serait
// plus propre, mais rien ne garantit que Claude Code tolere les cles inconnues d'un hook.
export const HOOK_MARKER = '# agent-office-hook'

export const HOOKED_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'Notification',
  'Stop',
  'SubagentStart',
  'SubagentStop',
  'SessionEnd'
] as const

export type HookedEvent = (typeof HOOKED_EVENTS)[number]

const ASYNC_MAX_SECONDS = 1
// SessionEnd ne peut pas etre async (le process se termine juste apres) et partage un budget de
// 1,5 s avec les autres hooks de l'evenement : on prend une part tres courte.
const SESSION_END_MAX_SECONDS = 0.3
const SESSION_END_TIMEOUT_SECONDS = 1

export interface HookHandler {
  type: string
  command?: string
  async?: boolean
  timeout?: number
  [key: string]: unknown
}

export interface HookGroup {
  matcher?: string
  hooks: HookHandler[]
  [key: string]: unknown
}

export type HooksSection = Record<string, HookGroup[]>

export interface Settings {
  hooks?: HooksSection
  [key: string]: unknown
}

export function hookCommand(port: number, maxSeconds: number): string {
  return [
    `curl -s -o /dev/null --max-time ${maxSeconds}`,
    `-H 'Content-Type: application/json' --data-binary @-`,
    `http://127.0.0.1:${port}/events >/dev/null 2>&1 || true ${HOOK_MARKER}`
  ].join(' ')
}

export function agentOfficeHandler(event: HookedEvent, port: number): HookHandler {
  if (event === 'SessionEnd') {
    return {
      type: 'command',
      command: hookCommand(port, SESSION_END_MAX_SECONDS),
      timeout: SESSION_END_TIMEOUT_SECONDS
    }
  }
  return { type: 'command', command: hookCommand(port, ASYNC_MAX_SECONDS), async: true }
}

export function isAgentOfficeHandler(handler: HookHandler): boolean {
  return typeof handler.command === 'string' && handler.command.includes(HOOK_MARKER)
}

export function installHooks(settings: Settings, port: number): Settings {
  const cleaned = withoutAgentOfficeHooks(settings.hooks ?? {})
  const hooks: HooksSection = { ...cleaned }
  for (const event of HOOKED_EVENTS) {
    hooks[event] = [...(hooks[event] ?? []), { hooks: [agentOfficeHandler(event, port)] }]
  }
  return { ...settings, hooks }
}

export function uninstallHooks(settings: Settings): Settings {
  if (!settings.hooks) return settings
  const hooks = withoutAgentOfficeHooks(settings.hooks)
  if (Object.keys(hooks).length === 0) {
    const rest = { ...settings }
    delete rest.hooks
    return rest
  }
  return { ...settings, hooks }
}

export function installedPort(settings: Settings): number | null {
  for (const groups of Object.values(settings.hooks ?? {})) {
    for (const group of groups) {
      for (const handler of group.hooks ?? []) {
        const port = isAgentOfficeHandler(handler)
          ? handler.command!.match(/127\.0\.0\.1:(\d+)\//)?.[1]
          : undefined
        if (port) return Number(port)
      }
    }
  }
  return null
}

// On ne retire que nos handlers ; un groupe ou un evenement n'est supprime que s'il ne contenait
// rien d'autre, pour rendre a l'identique un fichier installe puis desinstalle.
function withoutAgentOfficeHooks(hooks: HooksSection): HooksSection {
  const result: HooksSection = {}
  for (const [event, groups] of Object.entries(hooks)) {
    const kept: HookGroup[] = []
    for (const group of groups) {
      const handlers = (group.hooks ?? []).filter((handler) => !isAgentOfficeHandler(handler))
      if (handlers.length === group.hooks?.length) {
        kept.push(group)
      } else if (handlers.length > 0) {
        kept.push({ ...group, hooks: handlers })
      }
    }
    if (kept.length > 0 || groups.length === 0) {
      result[event] = kept
    }
  }
  return result
}

export function parsePort(value: string | undefined): number {
  if (value === undefined || value === '') return DEFAULT_PORT
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`Port invalide : ${value} (attendu : entier entre 1024 et 65535)`)
  }
  return port
}

export function describeChanges(before: Settings, after: Settings): string[] {
  const events = new Set([...Object.keys(before.hooks ?? {}), ...Object.keys(after.hooks ?? {})])
  const lines: string[] = []
  for (const event of events) {
    const was = ourHandlers(before, event)
    const now = ourHandlers(after, event)
    if (was.join() === now.join()) continue
    if (was.length === 0) lines.push(`+ ${event} : ajout du hook agent-office`)
    else if (now.length === 0) lines.push(`- ${event} : retrait du hook agent-office`)
    else lines.push(`~ ${event} : mise a jour du hook agent-office`)
  }
  return lines
}

function ourHandlers(settings: Settings, event: string): string[] {
  return (settings.hooks?.[event] ?? [])
    .flatMap((group) => group.hooks ?? [])
    .filter(isAgentOfficeHandler)
    .map((handler) => JSON.stringify(handler))
}
