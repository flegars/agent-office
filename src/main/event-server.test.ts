import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EVENTS_PATH, startEventServer } from './event-server'

describe('startEventServer', () => {
  let server: Server
  let received: unknown[]
  let baseUrl: string

  beforeEach(async () => {
    received = []
    server = await startEventServer({
      port: 0,
      maxBodyBytes: 1_024,
      onPayload: (payload) => received.push(payload)
    })
    const address = server.address() as AddressInfo
    baseUrl = `http://${address.address}:${address.port}`
  })

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  function post(body: string, headers: Record<string, string> = {}): Promise<Response> {
    return fetch(`${baseUrl}${EVENTS_PATH}`, { method: 'POST', body, headers })
  }

  async function settled(): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve))
  }

  it('n’ecoute que sur la boucle locale', () => {
    expect((server.address() as AddressInfo).address).toBe('127.0.0.1')
  })

  it('repond 204 sans corps et transmet le payload', async () => {
    const response = await post(JSON.stringify({ session_id: 's', hook_event_name: 'Stop' }))
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    await settled()
    expect(received).toEqual([{ session_id: 's', hook_event_name: 'Stop' }])
  })

  it('repond 204 sans rien transmettre sur un JSON invalide', async () => {
    expect((await post('{pas du json')).status).toBe(204)
    await settled()
    expect(received).toEqual([])
  })

  it('refuse un corps trop gros', async () => {
    expect((await post(JSON.stringify({ blob: 'x'.repeat(2_000) }))).status).toBe(413)
    await settled()
    expect(received).toEqual([])
  })

  it('refuse les requetes venant d’un navigateur', async () => {
    expect((await post('{}', { Origin: 'https://evil.example' })).status).toBe(403)
    await settled()
    expect(received).toEqual([])
  })

  it('repond 404 hors de POST /events', async () => {
    expect((await fetch(`${baseUrl}${EVENTS_PATH}`)).status).toBe(404)
    expect((await fetch(`${baseUrl}/autre`, { method: 'POST', body: '{}' })).status).toBe(404)
  })

  it('echoue proprement si le port est deja pris', async () => {
    const port = (server.address() as AddressInfo).port
    await expect(
      startEventServer({ port, maxBodyBytes: 1_024, onPayload: () => {} })
    ).rejects.toThrow(/EADDRINUSE/)
  })
})
