import { activityForTool } from './activity'
import { IslandPlan, ISLANDS_PER_ROW } from './desks'
import { projectName } from './normalize'
import type { AgentState, NormalizedEvent, OfficeSnapshot } from './types'

export interface OfficeOptions {
  inactivityMs: number
  leaveAnimationMs: number
  historyLimit: number
  memoryMs: number
}

export const DEFAULT_OFFICE_OPTIONS: OfficeOptions = {
  inactivityMs: 30 * 60_000,
  leaveAnimationMs: 6_000,
  historyLimit: 20,
  memoryMs: 10 * 60_000
}

type EventOf<K extends NormalizedEvent['kind']> = Extract<NormalizedEvent, { kind: K }>

export class OfficeStore {
  private readonly options: OfficeOptions
  private readonly agents = new Map<string, AgentState>()
  private readonly desks = new IslandPlan(ISLANDS_PER_ROW)
  private readonly endedAt = new Map<string, number>()
  private readonly finishedToolsAt = new Map<string, number>()
  private readonly spawnLabels = new Map<string, { label: string; at: number }>()

  constructor(options: Partial<OfficeOptions> = {}) {
    this.options = { ...DEFAULT_OFFICE_OPTIONS, ...options }
  }

  apply(event: NormalizedEvent): boolean {
    if (event.kind === 'sessionStart') {
      this.endedAt.delete(event.sessionId)
    } else if (this.endedAt.has(event.sessionId)) {
      return false
    }

    if (event.kind === 'sessionEnd') {
      return this.endSession(event)
    }

    const session = this.ensureSession(event)
    switch (event.kind) {
      case 'sessionStart':
        session.activity = 'idle'
        this.record(session, event.at, 'Session démarrée', event.source)
        return true
      case 'prompt':
        session.activity = 'thinking'
        session.currentTool = null
        session.lastPrompt = event.prompt
        this.record(session, event.at, 'Prompt', event.prompt)
        return true
      case 'subagentReport':
        session.activity = 'thinking'
        this.record(session, event.at, 'Rapport reçu', this.labelOf(event.fromAgentId))
        return true
      case 'toolStart':
        return this.startTool(session, event)
      case 'toolEnd':
        return this.endTool(session, event)
      case 'permissionRequest':
        return this.requestPermission(session, event)
      case 'notification':
        return this.notify(session, event)
      case 'stop':
        return this.stop(session, event)
      case 'subagentStart':
        return this.startSubagent(session, event)
      case 'subagentStop':
        return this.stopSubagent(session, event)
    }
  }

  tick(now: number): boolean {
    let changed = false
    for (const agent of [...this.agents.values()]) {
      if (agent.presence === 'leaving') {
        if (agent.leftAt !== null && now - agent.leftAt >= this.options.leaveAnimationMs) {
          this.agents.delete(agent.id)
          this.desks.release(agent.deskId)
          changed = true
        }
      } else if (now - agent.lastEventAt >= this.options.inactivityMs) {
        this.record(agent, now, 'Inactivité', null)
        this.leave(agent, now)
        changed = true
      }
    }
    this.forgetOlderThan(now - this.options.memoryMs)
    return changed
  }

  snapshot(): OfficeSnapshot {
    return structuredClone({
      agents: [...this.agents.values()].sort((a, b) => a.deskId - b.deskId),
      desks: this.desks.desks(),
      islands: this.desks.islands,
      islandsPerRow: ISLANDS_PER_ROW
    })
  }

  private endSession(event: EventOf<'sessionEnd'>): boolean {
    this.endedAt.set(event.sessionId, event.at)
    const session = this.agents.get(event.sessionId)
    if (!session) return false
    this.record(session, event.at, 'Session terminée', event.reason)
    for (const agent of this.agents.values()) {
      if (agent.sessionId === event.sessionId) {
        this.leave(agent, event.at)
      }
    }
    return true
  }

  private startTool(session: AgentState, event: EventOf<'toolStart'>): boolean {
    const actor = this.resolveActor(session, event.agentId, event.agentType, event.at)
    if (!actor) return false
    this.record(actor, event.at, 'Outil', describeTool(event.toolName, event.target))
    if (this.finishedToolsAt.has(event.toolUseId)) {
      return true
    }
    actor.activity = activityForTool(event.toolName)
    actor.currentTool = { name: event.toolName, target: event.target, toolUseId: event.toolUseId }
    return true
  }

  private endTool(session: AgentState, event: EventOf<'toolEnd'>): boolean {
    this.finishedToolsAt.set(event.toolUseId, event.at)
    if (event.spawnedAgentId && event.spawnedDescription) {
      this.labelSubagent(event.spawnedAgentId, event.spawnedDescription, event.at)
    }
    const actor = this.resolveActor(session, event.agentId, event.agentType, event.at)
    if (!actor) return false
    if (event.failed) {
      this.record(actor, event.at, 'Échec outil', event.toolName)
    }
    if (actor.currentTool?.toolUseId === event.toolUseId || actor.activity === 'waitingInput') {
      actor.currentTool = null
      actor.activity = 'thinking'
    }
    return true
  }

  private requestPermission(session: AgentState, event: EventOf<'permissionRequest'>): boolean {
    const actor = this.resolveActor(session, event.agentId, event.agentType, event.at)
    if (!actor) return false
    actor.activity = 'waitingInput'
    this.record(actor, event.at, 'Permission demandée', describeTool(event.toolName, event.target))
    return true
  }

  private notify(session: AgentState, event: EventOf<'notification'>): boolean {
    this.record(session, event.at, 'Notification', event.message ?? event.notificationType)
    const someoneWaits = this.sessionMembers(session.sessionId).some(
      (agent) => agent.activity === 'waitingInput'
    )
    if (
      (event.notificationType === 'permission_prompt' ||
        event.notificationType === 'elicitation_dialog') &&
      !someoneWaits
    ) {
      session.activity = 'waitingInput'
    } else if (event.notificationType === 'idle_prompt' && session.activity !== 'waitingTeam') {
      session.activity = 'idle'
      session.currentTool = null
    }
    return true
  }

  private stop(session: AgentState, event: EventOf<'stop'>): boolean {
    const running = new Set(event.runningSubagentIds)
    for (const agent of this.sessionMembers(session.sessionId)) {
      if (agent.kind === 'subagent' && !running.has(agent.id)) {
        this.endedAt.set(agent.id, event.at)
        this.leave(agent, event.at)
      }
    }
    session.currentTool = null
    session.activity = running.size > 0 ? 'waitingTeam' : 'idle'
    this.record(
      session,
      event.at,
      'Fin de tour',
      running.size > 0 ? `${running.size} sous-agent(s) en cours` : null
    )
    return true
  }

  private startSubagent(session: AgentState, event: EventOf<'subagentStart'>): boolean {
    const subagent = this.resolveActor(session, event.agentId, event.agentType, event.at)
    if (!subagent) return false
    this.record(session, event.at, 'Sous-agent arrivé', describeSubagent(subagent))
    return true
  }

  private stopSubagent(session: AgentState, event: EventOf<'subagentStop'>): boolean {
    this.endedAt.set(event.agentId, event.at)
    const subagent = this.agents.get(event.agentId)
    if (!subagent || subagent.presence === 'leaving') return false
    this.record(subagent, event.at, 'Terminé', null)
    this.leave(subagent, event.at)
    this.record(session, event.at, 'Sous-agent parti', describeSubagent(subagent))
    const teamStillWorking = this.sessionMembers(session.sessionId).some(
      (agent) => agent.kind === 'subagent' && agent.presence === 'present'
    )
    if (session.activity === 'waitingTeam' && !teamStillWorking) {
      session.activity = 'idle'
    }
    return true
  }

  private ensureSession(event: NormalizedEvent): AgentState {
    const existing = this.agents.get(event.sessionId)
    if (existing) {
      this.comeBack(existing)
      this.touch(existing, event.at)
      if (!existing.cwd && event.cwd) {
        existing.cwd = event.cwd
        existing.project = projectName(event.cwd)
        existing.label = existing.project
      }
      return existing
    }
    const project = projectName(event.cwd)
    const session = this.newAgent({
      id: event.sessionId,
      kind: 'session',
      sessionId: event.sessionId,
      parentId: null,
      agentType: null,
      label: project,
      project,
      cwd: event.cwd,
      deskId: this.desks.assignLeadDesk(event.sessionId),
      at: event.at
    })
    this.agents.set(session.id, session)
    return session
  }

  private resolveActor(
    session: AgentState,
    agentId: string | null,
    agentType: string | null,
    at: number
  ): AgentState | null {
    if (!agentId) return session
    if (this.endedAt.has(agentId)) return null
    const existing = this.agents.get(agentId)
    if (existing) {
      this.comeBack(existing)
      this.touch(existing, at)
      return existing
    }
    const subagent = this.newAgent({
      id: agentId,
      kind: 'subagent',
      sessionId: session.sessionId,
      parentId: session.id,
      agentType,
      label: this.spawnLabels.get(agentId)?.label ?? agentType ?? 'sous-agent',
      project: session.project,
      cwd: session.cwd,
      deskId: this.desks.assignBenchDesk(agentId, session.deskId),
      at
    })
    subagent.activity = 'thinking'
    this.agents.set(subagent.id, subagent)
    return subagent
  }

  private newAgent(
    fields: Pick<
      AgentState,
      | 'id'
      | 'kind'
      | 'sessionId'
      | 'parentId'
      | 'agentType'
      | 'label'
      | 'project'
      | 'cwd'
      | 'deskId'
    > & { at: number }
  ): AgentState {
    const { at, ...identity } = fields
    return {
      ...identity,
      activity: 'idle',
      presence: 'present',
      currentTool: null,
      lastPrompt: null,
      lastEventAt: at,
      leftAt: null,
      history: []
    }
  }

  private labelSubagent(agentId: string, label: string, at: number): void {
    const subagent = this.agents.get(agentId)
    if (subagent) {
      subagent.label = label
    } else {
      this.spawnLabels.set(agentId, { label, at })
    }
  }

  private labelOf(agentId: string | null): string | null {
    if (!agentId) return null
    return this.agents.get(agentId)?.label ?? this.spawnLabels.get(agentId)?.label ?? agentId
  }

  private sessionMembers(sessionId: string): AgentState[] {
    return [...this.agents.values()].filter((agent) => agent.sessionId === sessionId)
  }

  private touch(agent: AgentState, at: number): void {
    agent.lastEventAt = Math.max(agent.lastEventAt, at)
    const session = this.agents.get(agent.sessionId)
    if (session && session !== agent) {
      session.lastEventAt = Math.max(session.lastEventAt, at)
    }
  }

  private comeBack(agent: AgentState): void {
    if (agent.presence === 'leaving') {
      agent.presence = 'present'
      agent.leftAt = null
    }
  }

  private leave(agent: AgentState, at: number): void {
    if (agent.presence === 'leaving') return
    agent.presence = 'leaving'
    agent.leftAt = at
    agent.activity = 'idle'
    agent.currentTool = null
  }

  private record(agent: AgentState, at: number, event: string, detail: string | null): void {
    agent.history.push({ at, event, detail })
    if (agent.history.length > this.options.historyLimit) {
      agent.history.splice(0, agent.history.length - this.options.historyLimit)
    }
  }

  private forgetOlderThan(threshold: number): void {
    for (const [id, at] of this.endedAt) if (at < threshold) this.endedAt.delete(id)
    for (const [id, at] of this.finishedToolsAt) if (at < threshold) this.finishedToolsAt.delete(id)
    for (const [id, entry] of this.spawnLabels)
      if (entry.at < threshold) this.spawnLabels.delete(id)
  }
}

function describeSubagent(subagent: AgentState): string {
  const type = subagent.agentType ?? 'sous-agent'
  return subagent.label === type ? type : `${type} · ${subagent.label}`
}

function describeTool(toolName: string, target: string | null): string {
  return target ? `${toolName} · ${target}` : toolName
}
