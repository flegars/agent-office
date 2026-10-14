import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { resolveAppPath } from './app-path'

export const APP_SCHEME = 'app'
export const APP_ENTRY_URL = `${APP_SCHEME}://office/index.html`

// Sous file://, Chromium refuse le fetch utilise par le chargeur glTF : le renderer de
// production est donc servi par un schema privilegie qui se comporte comme une origine http.
export function registerAppSchemeAsPrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
  ])
}

export function serveRendererFrom(rendererDir: string): void {
  protocol.handle(APP_SCHEME, (request) => {
    const filePath = resolveAppPath(rendererDir, request.url)
    if (!filePath) {
      return new Response(null, { status: 404 })
    }
    return net.fetch(pathToFileURL(filePath).toString())
  })
}
