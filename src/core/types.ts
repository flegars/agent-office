export type Activity =
  | 'idle'
  | 'thinking'
  | 'reading'
  | 'typing'
  | 'terminal'
  | 'browsing'
  | 'delegating'
  | 'reporting'
  | 'waitingInput'
  | 'waitingTeam'

export type Presence = 'present' | 'leaving'

export type AgentKind = 'session' | 'subagent'

export interface CurrentTool {
  name: string
  target: string | null
  toolUseId: string
}

export interface HistoryEntry {
  at: number
  event: string
  detail: string | null
}

export interface AgentState {
  id: string
  kind: AgentKind
  sessionId: string
  parentId: string | null
  agentType: string | null
  label: string
  project: string
  cwd: string
  deskId: number
  activity: Activity
  presence: Presence
  currentTool: CurrentTool | null
  lastPrompt: string | null
  lastEventAt: number
  leftAt: number | null
  history: HistoryEntry[]
}

export type DeskKind = 'lead' | 'bench'

export interface Desk {
  id: number
  kind: DeskKind
  island: number
  seat: number
  occupantId: string | null
}

export interface OfficeSnapshot {
  agents: AgentState[]
  desks: Desk[]
  islands: number
  islandsPerRow: number
}

interface EventBase {
  sessionId: string
  cwd: string
  at: number
}

export type NormalizedEvent = EventBase &
  (
    | { kind: 'sessionStart'; source: string | null }
    | { kind: 'sessionEnd'; reason: string | null }
    | { kind: 'prompt'; prompt: string }
    | { kind: 'subagentReport'; fromAgentId: string | null }
    | {
        kind: 'toolStart'
        agentId: string | null
        agentType: string | null
        toolName: string
        toolUseId: string
        target: string | null
      }
    | {
        kind: 'toolEnd'
        agentId: string | null
        agentType: string | null
        toolName: string
        toolUseId: string
        failed: boolean
        spawnedAgentId: string | null
        spawnedDescription: string | null
      }
    | {
        kind: 'permissionRequest'
        agentId: string | null
        agentType: string | null
        toolName: string
        target: string | null
      }
    | { kind: 'notification'; notificationType: string | null; message: string | null }
    | { kind: 'stop'; runningSubagentIds: string[] }
    | { kind: 'subagentStart'; agentId: string; agentType: string }
    | { kind: 'subagentStop'; agentId: string; agentType: string }
  )

export type EventKind = NormalizedEvent['kind']
