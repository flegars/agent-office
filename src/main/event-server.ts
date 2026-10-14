import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

export const EVENT_SERVER_HOST = '127.0.0.1'
export const EVENTS_PATH = '/events'

export interface EventServerOptions {
  port: number
  maxBodyBytes: number
  onPayload: (payload: unknown) => void
}

export function startEventServer(options: EventServerOptions): Promise<Server> {
  const server = createServer((request, response) => handle(request, response, options))
  server.requestTimeout = 5_000
  server.headersTimeout = 5_000
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, EVENT_SERVER_HOST, () => {
      server.off('error', reject)
      resolve(server)
    })
  })
}

function handle(
  request: IncomingMessage,
  response: ServerResponse,
  options: EventServerOptions
): void {
  if (request.method !== 'POST' || request.url !== EVENTS_PATH) {
    reply(response, 404)
    request.resume()
    return
  }
  // Les hooks passent par curl, jamais par un navigateur : refuser toute requete portant un
  // Origin bloque les pages web qui tenteraient d'injecter de faux evenements sur localhost.
  if (request.headers.origin !== undefined) {
    reply(response, 403)
    request.resume()
    return
  }

  const chunks: Buffer[] = []
  let size = 0
  let tooLarge = false
  request.on('data', (chunk: Buffer) => {
    size += chunk.length
    if (size > options.maxBodyBytes) {
      tooLarge = true
      chunks.length = 0
    } else if (!tooLarge) {
      chunks.push(chunk)
    }
  })
  request.on('end', () => {
    reply(response, tooLarge ? 413 : 204)
    if (!tooLarge) {
      dispatch(Buffer.concat(chunks).toString('utf8'), options.onPayload)
    }
  })
  request.on('error', () => reply(response, 400))
}

function dispatch(body: string, onPayload: (payload: unknown) => void): void {
  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return
  }
  onPayload(payload)
}

function reply(response: ServerResponse, status: number): void {
  if (!response.headersSent) {
    response.writeHead(status, { 'Content-Length': '0' })
  }
  response.end()
}
