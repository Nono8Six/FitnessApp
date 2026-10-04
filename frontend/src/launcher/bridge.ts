export type Phase = 'stopped' | 'preparing' | 'starting' | 'running' | 'stopping' | 'external' | 'error'
export type Options = { simulation: boolean; network: boolean }
export type Snapshot = {
  phase: Phase
  owned: boolean
  can_stop: boolean
  pid: number | null
  url: string
  mode: 'reel' | 'simulation' | null
  network: boolean | null
  phone_urls: string[]
  started_at: number | null
  error: string | null
  logs: { id: number; time: number; source: string; text: string }[]
}

declare global {
  interface Window {
    __TAURI__?: { core: { invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> } }
  }
}

export async function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  if (window.__TAURI__) return window.__TAURI__.core.invoke<T>(command, args)
  // Développement Chrome : le pont local exécute le même superviseur Rust.
  // Vite élimine ce chemin de l'exécutable de production.
  if (import.meta.env.DEV) {
    const response = await fetch('/__launcher', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, ...args }), signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error('Le pont de développement du lanceur est indisponible.')
    const result: { ok?: T; error?: string } = await response.json()
    if (result.error) throw new Error(result.error)
    return result.ok as T
  }
  throw new Error('Ouvrir « Lancer Fitness.cmd » pour utiliser le lanceur Windows.')
}
