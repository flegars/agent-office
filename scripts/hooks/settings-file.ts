import { constants } from 'node:fs'
import { chmod, copyFile, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Settings } from './hooks-config'

export interface CliOptions {
  settingsPath: string
  dryRun: boolean
  port: string | undefined
}

export function parseCli(argv: string[], env: NodeJS.ProcessEnv): CliOptions {
  const valueOf = (flag: string): string | undefined => {
    const index = argv.indexOf(flag)
    return index >= 0 ? argv[index + 1] : undefined
  }
  const configDir = env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
  return {
    settingsPath: valueOf('--settings') ?? join(configDir, 'settings.json'),
    dryRun: argv.includes('--dry-run'),
    port: valueOf('--port') ?? env.AGENT_OFFICE_PORT
  }
}

export async function readSettings(path: string): Promise<{ exists: boolean; settings: Settings }> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { exists: false, settings: {} }
    throw error
  }
  const parsed: unknown = JSON.parse(text)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${path} ne contient pas un objet JSON`)
  }
  return { exists: true, settings: parsed as Settings }
}

export function serializeSettings(settings: Settings): string {
  return `${JSON.stringify(settings, null, 2)}\n`
}

export function backupPathFor(path: string, at: Date): string {
  const stamp = at.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  return `${path}.agent-office-backup-${stamp}`
}

// Ecriture atomique : un Claude Code qui relit le fichier au meme moment ne voit jamais un JSON tronque.
export async function writeSettings(
  path: string,
  settings: Settings,
  exists: boolean
): Promise<string | null> {
  let backup: string | null = null
  let mode: number | undefined
  if (exists) {
    backup = await copyToFreshBackup(path, backupPathFor(path, new Date()))
    mode = (await stat(path)).mode
  }
  const temporary = join(dirname(path), `.settings.agent-office-${process.pid}.tmp`)
  await writeFile(temporary, serializeSettings(settings), 'utf8')
  if (mode !== undefined) await chmod(temporary, mode)
  await rename(temporary, path)
  return backup
}

// Deux passages dans la meme seconde ne doivent jamais ecraser une sauvegarde existante.
async function copyToFreshBackup(path: string, base: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`
    try {
      await copyFile(path, candidate, constants.COPYFILE_EXCL)
      return candidate
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
}
