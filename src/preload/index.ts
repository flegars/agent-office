import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC_CHANNELS, type OfficeApi, type OfficeUpdate } from '../shared/ipc'

const api: OfficeApi = {
  getUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.getUpdate),
  onUpdate: (listener) => {
    const handler = (_event: IpcRendererEvent, update: OfficeUpdate): void => listener(update)
    ipcRenderer.on(IPC_CHANNELS.update, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.update, handler)
    }
  }
}

contextBridge.exposeInMainWorld('office', api)
