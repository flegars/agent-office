import type { Activity, AgentState } from '../../../core/types'

export const ACTIVITY_LABELS: Record<Activity, string> = {
  idle: '😌 au repos',
  thinking: '💭 réfléchit',
  reading: '📖 lit',
  typing: '⌨️ tape',
  terminal: '🖥️ terminal',
  browsing: '🌐 navigue',
  delegating: '📨 délègue',
  reporting: '📋 rend son rapport',
  waitingInput: '✋ attend une réponse',
  waitingTeam: '⏳ attend son équipe'
}

export function statusLabel(agent: AgentState, stillInOffice: boolean): string {
  if (!stillInOffice) return '🚪 a quitté le bureau'
  if (agent.presence === 'leaving') return '👋 s’en va'
  return ACTIVITY_LABELS[agent.activity]
}

export function kindLabel(agent: AgentState): string {
  if (agent.kind === 'session') return 'Session Claude Code'
  return agent.agentType ? `Sous-agent · ${agent.agentType}` : 'Sous-agent'
}

export function formatAge(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1_000))
  if (seconds < 60) return `il y a ${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `il y a ${minutes} min`
  return `il y a ${Math.floor(minutes / 60)} h`
}

export function formatClock(at: number): string {
  return new Date(at).toLocaleTimeString('fr-FR')
}

export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id
}

export interface Relatives {
  parent: AgentState | null
  team: AgentState[]
}

export function relativesOf(agents: AgentState[], agent: AgentState): Relatives {
  return {
    parent: agent.parentId ? (agents.find((other) => other.id === agent.parentId) ?? null) : null,
    team:
      agent.kind === 'session'
        ? agents.filter((other) => other.kind === 'subagent' && other.parentId === agent.id)
        : []
  }
}
