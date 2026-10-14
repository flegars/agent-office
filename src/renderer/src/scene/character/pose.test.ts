import { describe, expect, it } from 'vitest'
import type { Activity } from '../../../../core/types'
import {
  bubbleFor,
  displayDelayMs,
  gestureFor,
  gestureOffsets,
  screenFor,
  teamBubble
} from './pose'

const ACTIVITIES: Activity[] = [
  'idle',
  'thinking',
  'reading',
  'typing',
  'terminal',
  'browsing',
  'delegating',
  'reporting',
  'waitingInput',
  'waitingTeam'
]

describe('pose', () => {
  it('donne un geste, un ecran et une bulle a chaque activite', () => {
    for (const activity of ACTIVITIES) {
      expect(gestureFor(activity)).toBeTruthy()
      expect(screenFor(activity)).toBeTruthy()
      expect(bubbleFor(activity)).toBeTruthy()
    }
  })

  it('montre un terminal pour Bash et une page web pour la navigation', () => {
    expect(screenFor('terminal')).toBe('terminal')
    expect(screenFor('browsing')).toBe('web')
    expect(screenFor('waitingInput')).toBe('alert')
  })

  it('leve le bras droit bien au-dessus de la tete quand il attend une reponse', () => {
    const [, , z] = gestureOffsets(gestureFor('waitingInput'), 0.3)['arm-right']!
    expect(z).toBeLessThan(-2)
  })

  it('reprend les angles du bras droit en miroir pour le bras gauche', () => {
    const offsets = gestureOffsets('read', 0)
    const [rx, ry, rz] = offsets['arm-right']!
    expect(offsets['arm-left']).toEqual([rx, -ry, -rz])
  })

  it('agite les bras en tapant', () => {
    const before = gestureOffsets('type', 0)['arm-left']![2]
    const after = gestureOffsets('type', 0.05)['arm-left']![2]
    expect(after).not.toBe(before)
  })

  it('s’etire au debut du repos puis se detend', () => {
    expect(gestureOffsets('relax', 1)['arm-left']![2]).toBeGreaterThan(2)
    expect(gestureOffsets('relax', 1)['arm-right']![2]).toBeLessThan(-2)
    expect(gestureOffsets('relax', 10)['arm-left']).toBeUndefined()
  })

  it('agite la main levee pour saluer', () => {
    const zAt = (t: number): number => gestureOffsets('wave', t)['arm-right']![2]
    expect(zAt(0.1)).toBeLessThan(-1.7)
    expect(zAt(0.1)).not.toBeCloseTo(zAt(0.3))
  })
})

describe('maintien de l’activite affichee', () => {
  it('garde le geste de delegation au moins 1,5 s', () => {
    expect(displayDelayMs('delegating', 1_000, 1_600)).toBe(900)
    expect(displayDelayMs('delegating', 1_000, 3_000)).toBe(0)
  })

  it('change immediatement pour les autres activites', () => {
    expect(displayDelayMs('typing', 1_000, 1_001)).toBe(0)
  })
})

describe('bulle d’attente de l’equipe', () => {
  it('indique le nombre de sous-agents attendus quand il y en a plusieurs', () => {
    expect(teamBubble(1)).toBe('⏳')
    expect(teamBubble(3)).toBe('⏳ ×3')
  })
})
