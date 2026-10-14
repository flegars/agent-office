import { parseArgs } from 'node:util'
import { buildDemoScenario } from './simulator/demo-scenario'

const DEFAULT_PORT = 47821
const REQUEST_TIMEOUT_MS = 1_000

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: process.env['AGENT_OFFICE_PORT'] ?? String(DEFAULT_PORT) },
    speed: { type: 'string', default: '1' },
    loop: { type: 'boolean', default: false },
    quiet: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false }
  }
})

if (values.help) {
  console.log(`Rejoue une scene realiste d'evenements de hooks Claude Code vers Agent Office.

  npm run simulate -- [--speed 2] [--loop] [--port 47821] [--quiet]

  --speed  multiplie la vitesse de lecture (defaut 1)
  --loop   rejoue la scene en boucle, avec de nouvelles sessions a chaque tour
  --port   port du serveur Agent Office (defaut AGENT_OFFICE_PORT ou ${DEFAULT_PORT})
  --quiet  n'affiche pas chaque evenement envoye`)
  process.exit(0)
}

const speed = Number(values.speed)
const port = Number(values.port)
if (!(speed > 0) || !Number.isInteger(port)) {
  console.error('--speed doit etre > 0 et --port un entier')
  process.exit(1)
}
const endpoint = `http://127.0.0.1:${port}/events`

let unreachableWarned = false

async function send(payload: Record<string, unknown>): Promise<void> {
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    unreachableWarned = false
  } catch {
    if (!unreachableWarned) {
      console.warn(`⚠️  ${endpoint} injoignable : l'app est-elle lancee (npm run dev) ?`)
      unreachableWarned = true
    }
  }
}

function describe(payload: Record<string, unknown>): string {
  const session = String(payload['session_id']).split('-').slice(2).join('-')
  const agent = payload['agent_type'] ? ` [${payload['agent_type']}]` : ''
  const tool = payload['tool_name'] ? ` ${payload['tool_name']}` : ''
  return `${session}${agent} ${payload['hook_event_name']}${tool}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function playOnce(runId: string): Promise<void> {
  const scenario = buildDemoScenario(runId)
  const startedAt = Date.now()
  for (const { atMs, payload } of scenario) {
    const delay = atMs / speed - (Date.now() - startedAt)
    if (delay > 0) await sleep(delay)
    if (!values.quiet) {
      console.log(`${(atMs / 1_000).toFixed(1).padStart(6)}s  ${describe(payload)}`)
    }
    void send(payload)
  }
}

async function main(): Promise<void> {
  console.log(`Simulation vers ${endpoint} (vitesse x${speed}${values.loop ? ', en boucle' : ''})`)
  let run = 1
  do {
    await playOnce(`${Date.now().toString(36)}${run}`)
    run += 1
    if (values.loop) await sleep(3_000 / speed)
  } while (values.loop)
}

void main()
