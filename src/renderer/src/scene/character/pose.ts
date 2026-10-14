import type { Activity } from '../../../../core/types'

export type Bone = 'torso' | 'head' | 'arm-left' | 'arm-right'
export type Euler = [number, number, number]
export type BoneOffsets = Partial<Record<Bone, Euler>>

export type Gesture =
  'relax' | 'think' | 'read' | 'type' | 'mouse' | 'point' | 'raiseHand' | 'lookAround' | 'wave'

export type ScreenMode = 'idle' | 'code' | 'terminal' | 'web' | 'doc' | 'alert' | 'chat'

const STRETCH_SECONDS = 2.5
export const REPORT_HANDOVER_SECONDS = 1.3

// Un Agent asynchrone rend la main en moins d'une seconde : sans maintien, le geste de
// delegation passerait inapercu.
const MIN_DISPLAY_MS: Partial<Record<Activity, number>> = { delegating: 1_500 }

const GESTURES: Record<Activity, Gesture> = {
  idle: 'relax',
  thinking: 'think',
  reading: 'read',
  typing: 'type',
  terminal: 'type',
  browsing: 'mouse',
  delegating: 'point',
  reporting: 'point',
  waitingInput: 'raiseHand',
  waitingTeam: 'lookAround'
}

const SCREENS: Record<Activity, ScreenMode> = {
  idle: 'idle',
  thinking: 'chat',
  reading: 'doc',
  typing: 'code',
  terminal: 'terminal',
  browsing: 'web',
  delegating: 'chat',
  reporting: 'doc',
  waitingInput: 'alert',
  waitingTeam: 'chat'
}

const BUBBLES: Record<Activity, string> = {
  idle: '☕',
  thinking: '💭',
  reading: '📖',
  typing: '⌨️',
  terminal: '🖥️',
  browsing: '🌐',
  delegating: '📨',
  reporting: '📋',
  waitingInput: '✋',
  waitingTeam: '⏳'
}

export function displayDelayMs(shown: Activity, shownSinceMs: number, nowMs: number): number {
  const minimum = MIN_DISPLAY_MS[shown] ?? 0
  return Math.max(0, shownSinceMs + minimum - nowMs)
}

export function teamBubble(waitingFor: number): string {
  return waitingFor > 1 ? `${BUBBLES.waitingTeam} ×${waitingFor}` : BUBBLES.waitingTeam
}

export function gestureFor(activity: Activity): Gesture {
  return GESTURES[activity]
}

export function screenFor(activity: Activity): ScreenMode {
  return SCREENS[activity]
}

export function bubbleFor(activity: Activity): string {
  return BUBBLES[activity]
}

// Squelette Kenney en pose en T : chaque bras part le long de l'axe x local (vers -x pour le droit).
// Autour de z, le bras monte ou descend ; autour de y, il passe vers l'avant ; autour de x, il ne fait
// que tourner sur lui-meme. Le bras gauche reprend les memes angles en miroir.
// `elapsed` = secondes depuis le debut de l'activite.
export function gestureOffsets(gesture: Gesture, elapsed: number): BoneOffsets {
  const wave = (speed: number, amplitude: number, phase = 0): number =>
    Math.sin(elapsed * speed + phase) * amplitude
  const arms = (right: Euler, left: Euler = right): BoneOffsets => ({
    'arm-right': right,
    'arm-left': [left[0], -left[1], -left[2]]
  })

  switch (gesture) {
    case 'relax':
      if (elapsed < STRETCH_SECONDS) {
        return { torso: [-0.2, 0, 0], head: [-0.3, 0, 0], ...arms([0, 0.2, -2.3]) }
      }
      return { torso: [-0.12, 0, 0], head: [wave(0.8, 0.05), wave(0.4, 0.15), 0] }
    case 'think':
      return {
        head: [0.1, wave(0.6, 0.25), 0.15],
        torso: [0.05, 0, 0],
        'arm-right': [0, 1.4, -0.7]
      }
    case 'read':
      return { head: [0.35, wave(0.5, 0.2), 0], ...arms([0, 1.0, 0.7]) }
    case 'type':
      return {
        torso: [0.12, 0, 0],
        head: [0.15, 0, 0],
        ...arms([0, 1.35, 0.5 + wave(18, 0.15)], [0, 1.35, 0.5 + wave(18, 0.15, Math.PI)])
      }
    case 'mouse':
      return { head: [0.05, wave(0.7, 0.1), 0], 'arm-right': [0, 1.2, 0.6 + wave(3, 0.05)] }
    case 'point':
      return { head: [0, -0.6, 0], 'arm-right': [0, 1.5, -0.2] }
    case 'raiseHand':
      return { head: [-0.2, 0, 0], 'arm-right': [0, 0.3, -2.3 + wave(7, 0.25)] }
    case 'wave':
      return { head: [-0.1, 0, 0], 'arm-right': [0, 0.2, -2.2 + wave(10, 0.45)] }
    case 'lookAround':
      return {
        head: [0, wave(1.2, 0.6), 0],
        ...arms([0, 1.35, 0.5 + wave(9, 0.06)], [0, 1.35, 0.5 + wave(9, 0.06, 1)])
      }
  }
}
