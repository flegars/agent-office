import type { Activity } from './types'

const TOOL_ACTIVITIES: Record<string, Activity> = {
  Read: 'reading',
  Grep: 'reading',
  Glob: 'reading',
  LS: 'reading',
  NotebookRead: 'reading',
  ToolSearch: 'reading',
  Edit: 'typing',
  MultiEdit: 'typing',
  Write: 'typing',
  NotebookEdit: 'typing',
  Bash: 'terminal',
  BashOutput: 'terminal',
  KillShell: 'terminal',
  Monitor: 'terminal',
  WebFetch: 'browsing',
  WebSearch: 'browsing',
  Agent: 'delegating',
  Task: 'delegating',
  SubagentHandback: 'reporting'
}

export function activityForTool(toolName: string): Activity {
  if (toolName.startsWith('mcp__')) {
    return 'browsing'
  }
  return TOOL_ACTIVITIES[toolName] ?? 'thinking'
}
