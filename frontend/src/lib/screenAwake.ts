import { useCallback, useEffect, useRef, useState } from 'react'
import NoSleep from 'nosleep.js'

/** Wake Lock en HTTPS/localhost ; repli vidéo local pour l'accès Wi-Fi en HTTP. */
export function useScreenAwake(active: boolean) {
  const [status, setStatus] = useState<'idle' | 'requesting' | 'active' | 'unavailable'>('idle')
  const lock = useRef<WakeLockSentinel | null>(null)
  const fallback = useRef<NoSleep | null>(null)
  const generation = useRef(0)
  const pending = useRef(false)
  const release = useCallback(() => {
    generation.current++
    pending.current = false
    const previous = lock.current
    lock.current = null
    if (previous && !previous.released) void previous.release().catch(error => console.warn('Fitness : libération anti-veille impossible', error))
    fallback.current?.disable()
    fallback.current = null
    setStatus('idle')
  }, [])
  const request = useCallback(async () => {
    if (document.visibilityState !== 'visible' || pending.current) return
    if ((lock.current && !lock.current.released) || fallback.current?.isEnabled) return
    const attempt = generation.current
    pending.current = true
    setStatus('requesting')
    const timeout = window.setTimeout(() => {
      if (attempt !== generation.current) return
      release()
      console.warn('Fitness : le navigateur n’a pas confirmé l’anti-veille après 5 s')
      setStatus('unavailable')
    }, 5000)
    try {
      if ('wakeLock' in navigator) {
        const next = await navigator.wakeLock.request('screen')
        if (attempt !== generation.current) { await next.release(); return }
        lock.current = next
        next.addEventListener('release', () => {
          if (lock.current === next) { lock.current = null; setStatus('unavailable') }
        })
      } else {
        const video = fallback.current ??= new NoSleep()
        await video.enable()
        if (attempt !== generation.current) { video.disable(); return }
      }
      setStatus('active')
    } catch (error) {
      if (attempt === generation.current) {
        console.warn('Fitness : maintien de l’écran allumé refusé', error)
        setStatus('unavailable')
      }
    } finally {
      window.clearTimeout(timeout)
      if (attempt === generation.current) pending.current = false
    }
  }, [release])
  useEffect(() => {
    if (!active) { release(); return }
    void request()
    const visible = () => { if (document.visibilityState === 'visible') void request(); else release() }
    const retry = () => { void request() }
    document.addEventListener('visibilitychange', visible)
    document.addEventListener('click', retry)
    return () => {
      document.removeEventListener('visibilitychange', visible)
      document.removeEventListener('click', retry)
      release()
    }
  }, [active, release, request])
  return { status, request, release }
}
