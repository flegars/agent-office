import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  backupPathFor,
  parseCli,
  readSettings,
  serializeSettings,
  writeSettings
} from './settings-file'

describe('fichier de reglages', () => {
  let dir: string
  let path: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'agent-office-hooks-'))
    path = join(dir, 'settings.json')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('sauvegarde l’original avant d’ecrire et garde ses droits', async () => {
    await writeFile(path, '{\n  "theme": "dark"\n}\n', { mode: 0o600 })
    const backup = await writeSettings(path, { theme: 'light' }, true)
    expect(await readFile(backup!, 'utf8')).toBe('{\n  "theme": "dark"\n}\n')
    expect(await readFile(path, 'utf8')).toBe('{\n  "theme": "light"\n}\n')
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    expect((await readdir(dir)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('n’ecrase jamais une sauvegarde faite dans la meme seconde', async () => {
    await writeFile(path, '{\n  "v": 1\n}\n')
    const first = await writeSettings(path, { v: 2 }, true)
    const second = await writeSettings(path, { v: 3 }, true)
    expect(second).not.toBe(first)
    expect(await readFile(first!, 'utf8')).toBe('{\n  "v": 1\n}\n')
    expect(await readFile(second!, 'utf8')).toBe('{\n  "v": 2\n}\n')
  })

  it('cree le fichier absent sans sauvegarde', async () => {
    expect(await readSettings(path)).toEqual({ exists: false, settings: {} })
    expect(await writeSettings(path, { theme: 'dark' }, false)).toBeNull()
    expect(await readSettings(path)).toEqual({ exists: true, settings: { theme: 'dark' } })
  })

  it('refuse un JSON invalide plutot que de l’ecraser', async () => {
    await writeFile(path, '{ "theme": ')
    await expect(readSettings(path)).rejects.toThrow()
    await writeFile(path, '[]')
    await expect(readSettings(path)).rejects.toThrow('ne contient pas un objet JSON')
  })

  it('serialise comme Claude Code : deux espaces et saut de ligne final', () => {
    expect(serializeSettings({ a: { b: 1 } })).toBe('{\n  "a": {\n    "b": 1\n  }\n}\n')
  })

  it('date la sauvegarde', () => {
    expect(backupPathFor('/x/settings.json', new Date('2026-10-14T13:05:09Z'))).toBe(
      '/x/settings.json.agent-office-backup-20261014-130509'
    )
  })
})

describe('parseCli', () => {
  it('vise ~/.claude/settings.json par defaut et respecte CLAUDE_CONFIG_DIR', () => {
    expect(parseCli([], { HOME: '/h' }).settingsPath).toMatch(/\.claude\/settings\.json$/)
    expect(parseCli([], { CLAUDE_CONFIG_DIR: '/cfg' }).settingsPath).toBe('/cfg/settings.json')
  })

  it('lit --settings, --port et --dry-run', () => {
    expect(parseCli(['--settings', '/s.json', '--port', '50000', '--dry-run'], {})).toEqual({
      settingsPath: '/s.json',
      dryRun: true,
      port: '50000'
    })
  })
})
