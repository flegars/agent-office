import { CanvasTexture, SRGBColorSpace } from 'three'
import type { ScreenMode } from './character/pose'

const SCREEN_WIDTH = 256
const SCREEN_HEIGHT = 160

const screenCache = new Map<ScreenMode | 'off', CanvasTexture>()

export function screenTexture(mode: ScreenMode | 'off'): CanvasTexture {
  let texture = screenCache.get(mode)
  if (!texture) {
    texture = toTexture(drawScreen(mode))
    screenCache.set(mode, texture)
  }
  return texture
}

export function nameplateTexture(
  title: string,
  subtitle: string | null,
  accent: string
): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 112
  const context = canvas.getContext('2d')!
  context.fillStyle = '#20242f'
  roundRect(context, 0, 0, canvas.width, canvas.height, 18)
  context.fill()
  context.fillStyle = accent
  roundRect(context, 0, 0, 14, canvas.height, 7)
  context.fill()
  context.textBaseline = 'middle'
  context.fillStyle = '#f4f6fb'
  fitText(context, title, subtitle ? 44 : 52, 440, '600')
  context.fillText(title, 36, subtitle ? 42 : canvas.height / 2, 460)
  if (subtitle) {
    context.fillStyle = '#b9a8ec'
    context.font = '28px system-ui, sans-serif'
    context.fillText(subtitle, 36, 86, 460)
  }
  return toTexture(canvas)
}

function drawScreen(mode: ScreenMode | 'off'): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = SCREEN_WIDTH
  canvas.height = SCREEN_HEIGHT
  const context = canvas.getContext('2d')!
  const lines = (
    colors: string[],
    startY: number,
    step: number,
    indent: (index: number) => number = () => 0
  ): void => {
    for (let index = 0; startY + index * step < SCREEN_HEIGHT - 10; index++) {
      context.fillStyle = colors[index % colors.length]
      const width = 40 + ((index * 53) % 150)
      context.fillRect(16 + indent(index), startY + index * step, width, 7)
    }
  }

  switch (mode) {
    case 'off':
      fill(context, '#0b0d12')
      break
    case 'idle':
      fill(context, '#1b2335')
      context.font = '64px system-ui'
      context.textAlign = 'center'
      context.fillText('☕', SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 22)
      break
    case 'code':
      fill(context, '#1e1f2b')
      lines(
        ['#c792ea', '#82aaff', '#c3e88d', '#f78c6c', '#89ddff'],
        16,
        16,
        (i) => [0, 16, 32, 32, 16][i % 5]
      )
      break
    case 'terminal':
      fill(context, '#0a0f0a')
      context.font = 'bold 18px monospace'
      context.fillStyle = '#5dfc8d'
      context.fillText('$ npm test', 14, 28)
      lines(['#3fa863', '#5dfc8d', '#2f7d4a'], 44, 15)
      break
    case 'web':
      fill(context, '#f4f6fa')
      context.fillStyle = '#3b6fd9'
      context.fillRect(0, 0, SCREEN_WIDTH, 26)
      context.font = '52px system-ui'
      context.fillText('🌐', 18, 92)
      lines(['#9aa3b5', '#c3c9d6'], 48, 16, () => 80)
      break
    case 'doc':
      fill(context, '#fbfaf5')
      context.fillStyle = '#2d3142'
      context.fillRect(16, 14, 120, 12)
      lines(['#aab0bf', '#c8ccd6'], 40, 14)
      break
    case 'chat':
      fill(context, '#22252f')
      context.fillStyle = '#d97757'
      roundRect(context, 14, 18, 150, 34, 10)
      context.fill()
      context.fillStyle = '#3a3f4f'
      roundRect(context, 90, 64, 150, 34, 10)
      context.fill()
      context.fillStyle = '#d97757'
      roundRect(context, 14, 110, 110, 34, 10)
      context.fill()
      break
    case 'alert':
      fill(context, '#f5b83d')
      context.font = 'bold 110px system-ui'
      context.textAlign = 'center'
      context.fillStyle = '#2a1f05'
      context.fillText('?', SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 38)
      break
  }
  return canvas
}

function fill(context: CanvasRenderingContext2D, color: string): void {
  context.fillStyle = color
  context.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT)
}

function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  maxSize: number,
  maxWidth: number,
  weight: string
): void {
  let size = maxSize
  do {
    context.font = `${weight} ${size}px system-ui, sans-serif`
    size -= 2
  } while (context.measureText(text).width > maxWidth && size > 18)
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
}

function toTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}
