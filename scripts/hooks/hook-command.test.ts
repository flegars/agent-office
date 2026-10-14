import { spawn } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { startEventServer } from '../../src/main/event-server'
import { agentOfficeHandler } from './hooks-config'

interface Run {
  code: number | null
  stdout: string
  stderr: string
  ms: number
}

// Execute la commande exactement comme Claude Code : via sh, payload sur stdin.
function runHook(command: string, payload: string): Promise<Run> {
  const started = Date.now()
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', command])
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('close', (code) => resolve({ code, stdout, stderr, ms: Date.now() - started }))
    child.stdin.end(payload)
  })
}

const PAYLOAD = JSON.stringify({ session_id: 's1', cwd: '/p/demo', hook_event_name: 'Stop' })

describe('commande de hook', () => {
  let server: Server | null = null

  afterEach(async () => {
    if (server) await new Promise((resolve) => server!.close(resolve))
    server = null
  })

  async function freePort(): Promise<number> {
    const probe = createServer()
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
    const { port } = probe.address() as AddressInfo
    await new Promise((resolve) => probe.close(resolve))
    return port
  }

  it('livre le payload a l’app quand elle tourne', async () => {
    const received: unknown[] = []
    server = await startEventServer({
      port: 0,
      maxBodyBytes: 1_024,
      onPayload: (payload) => received.push(payload)
    })
    const { port } = server.address() as AddressInfo
    const run = await runHook(agentOfficeHandler('Stop', port).command!, PAYLOAD)
    expect(run).toMatchObject({ code: 0, stdout: '', stderr: '' })
    expect(received).toEqual([JSON.parse(PAYLOAD)])
  })

  it('reussit en silence et tout de suite quand l’app est fermee', async () => {
    const port = await freePort()
    for (const event of ['Stop', 'SessionEnd'] as const) {
      const run = await runHook(agentOfficeHandler(event, port).command!, PAYLOAD)
      expect(run).toMatchObject({ code: 0, stdout: '', stderr: '' })
      expect(run.ms).toBeLessThan(500)
    }
  })

  it('abandonne dans le delai quand l’app est figee', async () => {
    server = createServer(() => {})
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    const sessionEnd = await runHook(agentOfficeHandler('SessionEnd', port).command!, PAYLOAD)
    expect(sessionEnd).toMatchObject({ code: 0, stdout: '', stderr: '' })
    expect(sessionEnd.ms).toBeLessThan(800)
    const background = await runHook(agentOfficeHandler('Stop', port).command!, PAYLOAD)
    expect(background).toMatchObject({ code: 0, stdout: '', stderr: '' })
    expect(background.ms).toBeLessThan(1_600)
    server.closeAllConnections()
  })

  it('reste en succes meme si curl est introuvable', async () => {
    const command = agentOfficeHandler('Stop', 47821).command!.replace(/^curl /, 'curl-absent ')
    expect(await runHook(command, PAYLOAD)).toMatchObject({ code: 0, stdout: '', stderr: '' })
  })
})
