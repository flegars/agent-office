import { describe, expect, it } from 'vitest'
import {
  agentOfficeHandler,
  describeChanges,
  HOOKED_EVENTS,
  installedPort,
  installHooks,
  isAgentOfficeHandler,
  parsePort,
  uninstallHooks,
  type Settings
} from './hooks-config'

const ITERM = { type: 'command', command: '/Users/dev/.config/iterm2/cc-status' }
const ORCA = { type: 'command', command: 'orca-hook --long-script', timeout: 10 }

// Meme forme que le fichier reel : hooks tiers, groupes avec et sans matcher, autres cles.
function existingSettings(): Settings {
  return {
    statusLine: { type: 'command', command: 'status' },
    hooks: {
      Notification: [{ hooks: [ITERM] }],
      PreToolUse: [{ hooks: [ITERM] }, { matcher: '*', hooks: [ORCA] }],
      SessionEnd: [{ hooks: [ITERM] }],
      TeammateIdle: [{ hooks: [ORCA] }]
    },
    alwaysThinkingEnabled: true
  }
}

describe('installHooks', () => {
  it('ajoute un hook agent-office a chaque evenement suivi', () => {
    const installed = installHooks(existingSettings(), 47821)
    for (const event of HOOKED_EVENTS) {
      const ours = installed
        .hooks![event].flatMap((group) => group.hooks)
        .filter(isAgentOfficeHandler)
      expect(ours, event).toHaveLength(1)
    }
  })

  it('conserve les hooks existants, leur ordre et les autres reglages', () => {
    const installed = installHooks(existingSettings(), 47821)
    expect(installed.hooks!.PreToolUse.slice(0, 2)).toEqual(existingSettings().hooks!.PreToolUse)
    expect(installed.hooks!.TeammateIdle).toEqual([{ hooks: [ORCA] }])
    expect(installed.statusLine).toEqual({ type: 'command', command: 'status' })
    expect(Object.keys(installed)).toEqual(['statusLine', 'hooks', 'alwaysThinkingEnabled'])
  })

  it('ne modifie pas l’objet recu', () => {
    const settings = existingSettings()
    installHooks(settings, 47821)
    expect(settings).toEqual(existingSettings())
  })

  it('est idempotent', () => {
    const once = installHooks(existingSettings(), 47821)
    expect(installHooks(once, 47821)).toEqual(once)
  })

  it('remplace le port sans dupliquer le hook', () => {
    const moved = installHooks(installHooks(existingSettings(), 47821), 50000)
    expect(installedPort(moved)).toBe(50000)
    expect(JSON.stringify(moved)).not.toContain('47821')
  })

  it('cree la section hooks si le fichier n’en a pas', () => {
    expect(Object.keys(installHooks({}, 47821).hooks!)).toEqual([...HOOKED_EVENTS])
  })
})

describe('agentOfficeHandler', () => {
  it('passe par curl en arriere-plan, borne et toujours en succes, sans rien ecrire', () => {
    const handler = agentOfficeHandler('PreToolUse', 47821)
    expect(handler).toMatchObject({ type: 'command', async: true })
    expect(handler.command).toContain('--max-time 1')
    expect(handler.command).toContain('http://127.0.0.1:47821/events')
    expect(handler.command).toContain('>/dev/null 2>&1 || true')
  })

  it('reste synchrone mais tres court sur SessionEnd', () => {
    const handler = agentOfficeHandler('SessionEnd', 47821)
    expect(handler.async).toBeUndefined()
    expect(handler.timeout).toBe(1)
    expect(handler.command).toContain('--max-time 0.3')
  })
})

describe('uninstallHooks', () => {
  it('rend exactement le fichier d’origine', () => {
    const original = existingSettings()
    expect(uninstallHooks(installHooks(original, 47821))).toEqual(original)
  })

  it('retire la section hooks si elle ne contenait que les notres', () => {
    expect(uninstallHooks(installHooks({ theme: 'dark' }, 47821))).toEqual({ theme: 'dark' })
  })

  it('laisse un groupe partage avec un hook tiers', () => {
    const shared: Settings = {
      hooks: { Stop: [{ hooks: [ITERM, agentOfficeHandler('Stop', 47821)] }] }
    }
    expect(uninstallHooks(shared)).toEqual({ hooks: { Stop: [{ hooks: [ITERM] }] } })
  })

  it('ne touche a rien sans hook agent-office', () => {
    const original = existingSettings()
    expect(uninstallHooks(original)).toEqual(original)
    expect(uninstallHooks({ theme: 'dark' })).toEqual({ theme: 'dark' })
  })
})

describe('describeChanges', () => {
  it('liste les ajouts, mises a jour et retraits', () => {
    const installed = installHooks(existingSettings(), 47821)
    expect(describeChanges(existingSettings(), installed)).toContain(
      '+ PreToolUse : ajout du hook agent-office'
    )
    expect(describeChanges(installed, installHooks(installed, 50000))).toContain(
      '~ Stop : mise a jour du hook agent-office'
    )
    expect(describeChanges(installed, uninstallHooks(installed))).toHaveLength(HOOKED_EVENTS.length)
  })
})

describe('parsePort', () => {
  it('prend le port par defaut ou un port valide', () => {
    expect(parsePort(undefined)).toBe(47821)
    expect(parsePort('50000')).toBe(50000)
  })

  it('refuse un port invalide', () => {
    expect(() => parsePort('80')).toThrow('Port invalide')
    expect(() => parsePort('abc')).toThrow('Port invalide')
  })
})
