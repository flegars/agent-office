export interface ScheduledPayload {
  atMs: number
  payload: Record<string, unknown>
}

interface SubagentIdentity {
  agentId: string
  agentType: string
}

export class Timeline {
  private readonly scheduled: ScheduledPayload[] = []
  private toolCounter = 0

  constructor(private readonly runId: string) {}

  session(sessionId: string, cwd: string, startAtMs: number): SessionScript {
    return new SessionScript(this, { sessionId, cwd }, startAtMs, null)
  }

  push(atMs: number, payload: Record<string, unknown>): void {
    this.scheduled.push({ atMs, payload })
  }

  nextToolUseId(): string {
    this.toolCounter += 1
    return `toolu_sim_${this.runId}_${String(this.toolCounter).padStart(4, '0')}`
  }

  build(): ScheduledPayload[] {
    return [...this.scheduled].sort((a, b) => a.atMs - b.atMs)
  }
}

export class SessionScript {
  constructor(
    private readonly timeline: Timeline,
    private readonly identity: { sessionId: string; cwd: string },
    private clockMs: number,
    private readonly subagent: SubagentIdentity | null
  ) {}

  get now(): number {
    return this.clockMs
  }

  wait(ms: number): this {
    this.clockMs += ms
    return this
  }

  waitUntil(atMs: number): this {
    this.clockMs = Math.max(this.clockMs, atMs)
    return this
  }

  emit(hookEventName: string, fields: Record<string, unknown> = {}, offsetMs = 0): this {
    this.timeline.push(this.clockMs + offsetMs, {
      session_id: this.identity.sessionId,
      transcript_path: `/Users/dev/.claude/projects/sim/${this.identity.sessionId}.jsonl`,
      cwd: this.identity.cwd,
      permission_mode: 'default',
      hook_event_name: hookEventName,
      ...(this.subagent
        ? { agent_id: this.subagent.agentId, agent_type: this.subagent.agentType }
        : {}),
      ...fields
    })
    return this
  }

  start(source = 'startup'): this {
    return this.emit('SessionStart', { source, model: 'claude-opus-5-5' })
  }

  prompt(text: string): this {
    return this.emit('UserPromptSubmit', { prompt: text })
  }

  tool(
    toolName: string,
    toolInput: Record<string, unknown>,
    durationMs: number,
    gapMs = 400
  ): this {
    const toolUseId = this.timeline.nextToolUseId()
    this.emit('PreToolUse', { tool_name: toolName, tool_input: toolInput, tool_use_id: toolUseId })
    this.wait(durationMs)
    this.emit('PostToolUse', {
      tool_name: toolName,
      tool_input: toolInput,
      tool_use_id: toolUseId,
      tool_response: {},
      duration_ms: durationMs
    })
    return this.wait(gapMs)
  }

  toolArrivingOutOfOrder(toolName: string, toolInput: Record<string, unknown>): this {
    const toolUseId = this.timeline.nextToolUseId()
    this.emit('PostToolUse', {
      tool_name: toolName,
      tool_input: toolInput,
      tool_use_id: toolUseId,
      tool_response: {}
    })
    this.emit(
      'PreToolUse',
      { tool_name: toolName, tool_input: toolInput, tool_use_id: toolUseId },
      30
    )
    return this.wait(400)
  }

  toolNeedingPermission(
    toolName: string,
    toolInput: Record<string, unknown>,
    approvalDelayMs: number,
    durationMs: number
  ): this {
    const toolUseId = this.timeline.nextToolUseId()
    this.emit('PreToolUse', { tool_name: toolName, tool_input: toolInput, tool_use_id: toolUseId })
    this.emit('PermissionRequest', { tool_name: toolName, tool_input: toolInput }, 200)
    this.emit(
      'Notification',
      {
        message: `Claude needs your permission to use ${toolName}`,
        notification_type: 'permission_prompt'
      },
      1_000
    )
    this.wait(approvalDelayMs + durationMs)
    this.emit('PostToolUse', {
      tool_name: toolName,
      tool_input: toolInput,
      tool_use_id: toolUseId,
      tool_response: {}
    })
    return this.wait(400)
  }

  spawn(agentId: string, agentType: string, description: string): SessionScript {
    const toolUseId = this.timeline.nextToolUseId()
    const toolInput = { description, prompt: `Mission : ${description}`, subagent_type: agentType }
    this.emit('PreToolUse', { tool_name: 'Agent', tool_input: toolInput, tool_use_id: toolUseId })
    this.emit('SubagentStart', { agent_id: agentId, agent_type: agentType }, 600)
    this.emit(
      'PostToolUse',
      {
        tool_name: 'Agent',
        tool_input: toolInput,
        tool_use_id: toolUseId,
        tool_response: { agentId, isAsync: true, status: 'async_launched', description }
      },
      650
    )
    this.wait(900)
    return new SessionScript(this.timeline, this.identity, this.clockMs, { agentId, agentType })
  }

  handBack(summary: string): this {
    this.tool('SubagentHandback', { message: summary }, 500, 100)
    return this.emit('SubagentStop', { stop_hook_active: false, last_assistant_message: summary })
  }

  receiveReport(fromAgentId: string, summary: string): this {
    return this.prompt(
      `<agent-message from="${fromAgentId}">\n[Subagent hand-back] The text below is the final report of a subagent.\n${summary}`
    )
  }

  stop(runningSubagentIds: string[] = []): this {
    return this.emit('Stop', {
      stop_hook_active: false,
      last_assistant_message: 'Terminé.',
      background_tasks: runningSubagentIds.map((id) => ({
        id,
        type: 'subagent',
        status: 'running'
      })),
      session_crons: []
    })
  }

  end(reason = 'prompt_input_exit'): this {
    return this.emit('SessionEnd', { reason })
  }
}
