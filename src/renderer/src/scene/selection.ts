import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useRef } from 'react'

// Au-dela de quelques pixels, c'est la fin d'une rotation de camera, pas un clic.
const CLICK_TOLERANCE_PX = 4

export function isClick(event: ThreeEvent<MouseEvent>): boolean {
  return event.delta <= CLICK_TOLERANCE_PX
}

interface HoverHandlers {
  onPointerOver: (event: ThreeEvent<PointerEvent>) => void
  onPointerOut: () => void
}

export function useHoverCursor(): HoverHandlers {
  const hovered = useRef(false)
  useEffect(
    () => () => {
      if (hovered.current) document.body.style.cursor = ''
    },
    []
  )
  return {
    onPointerOver: (event) => {
      event.stopPropagation()
      hovered.current = true
      document.body.style.cursor = 'pointer'
    },
    onPointerOut: () => {
      hovered.current = false
      document.body.style.cursor = ''
    }
  }
}
