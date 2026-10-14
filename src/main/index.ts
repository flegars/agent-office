import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { IPC_CHANNELS, type OfficeUpdate, type ServerStatus } from '../shared/ipc'
import { APP_ENTRY_URL, registerAppSchemeAsPrivileged, serveRendererFrom } from './app-protocol'
import { EVENT_SERVER_HOST, startEventServer } from './event-server'
import { OfficeService } from './office-service'

const DEFAULT_PORT = 47821
const MAX_BODY_BYTES = 5 * 1024 * 1024

const serverStatus: ServerStatus = {
  host: EVENT_SERVER_HOST,
  port: resolvePort(process.env['AGENT_OFFICE_PORT']),
  listening: false,
  error: null
}

const office = new OfficeService(broadcast)

registerAppSchemeAsPrivileged()

function resolvePort(value: string | undefined): number {
  const port = Number(value)
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT
}

function currentUpdate(): OfficeUpdate {
  return { office: office.snapshot(), server: { ...serverStatus } }
}

function broadcast(): void {
  const update = currentUpdate()
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.update, update)
  }
}

async function startServer(): Promise<void> {
  try {
    await startEventServer({
      port: serverStatus.port,
      maxBodyBytes: MAX_BODY_BYTES,
      onPayload: (payload) => office.ingest(payload)
    })
    serverStatus.listening = true
  } catch (error) {
    serverStatus.error = error instanceof Error ? error.message : String(error)
    console.error(
      `[agent-office] serveur indisponible sur ${EVENT_SERVER_HOST}:${serverStatus.port}`,
      error
    )
  }
  broadcast()
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    title: 'Agent Office',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadURL(APP_ENTRY_URL)
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('fr.flegars.agent-office')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle(IPC_CHANNELS.getUpdate, () => currentUpdate())
  serveRendererFrom(join(__dirname, '../renderer'))

  office.start()
  void startServer()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => office.stop())
