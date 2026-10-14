import { describe, expect, it } from 'vitest'
import { resolveAppPath } from './app-path'

const ROOT = '/opt/agent-office/renderer'

describe('resolveAppPath', () => {
  it('sert les fichiers du renderer', () => {
    expect(resolveAppPath(ROOT, 'app://office/index.html')).toBe(`${ROOT}/index.html`)
    expect(resolveAppPath(ROOT, 'app://office/models/furniture/desk.glb')).toBe(
      `${ROOT}/models/furniture/desk.glb`
    )
  })

  it('decode les caracteres encodes', () => {
    expect(resolveAppPath(ROOT, 'app://office/assets/mon%20fichier.js')).toBe(
      `${ROOT}/assets/mon fichier.js`
    )
  })

  it('refuse de sortir du dossier du renderer', () => {
    expect(resolveAppPath(ROOT, 'app://office/../../etc/passwd')).toBe(`${ROOT}/etc/passwd`)
    expect(resolveAppPath(ROOT, 'app://office/%2e%2e/%2e%2e/etc/passwd')).toBe(`${ROOT}/etc/passwd`)
    expect(resolveAppPath(ROOT, 'app://office/%2F..%2F..%2Fetc%2Fpasswd')).toBeNull()
    expect(resolveAppPath(ROOT, 'app://office/')).toBeNull()
  })

  it('refuse une URL invalide', () => {
    expect(resolveAppPath(ROOT, 'pas une url')).toBeNull()
  })
})
