import { useSyncExternalStore } from 'react'
import type { ProfileId } from '../data/demo'

let current: ProfileId = 'arnaud'
const listeners = new Set<() => void>()

export function setProfile(id: ProfileId) {
  current = id
  listeners.forEach((l) => l())
}

export function useProfile() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}
