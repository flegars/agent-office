import { useEffect, useState } from 'react'
import type { OfficeUpdate } from '../../shared/ipc'

export function useOfficeUpdate(): OfficeUpdate | null {
  const [update, setUpdate] = useState<OfficeUpdate | null>(null)

  useEffect(() => {
    let active = true
    const unsubscribe = window.office.onUpdate((next) => setUpdate(next))
    window.office.getUpdate().then((initial) => {
      if (active) setUpdate((current) => current ?? initial)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return update
}
