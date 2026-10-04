/** Client commun du serveur du PC : délai borné, messages lisibles, réponses vérifiées. */

const TIMEOUT_MS = 4_000

export type ApiErrorKind = 'network' | 'http' | 'format'
export interface ValidationIssue { path: (string | number)[]; message: string }

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status?: number
  /** Requête concernée (« PATCH /api/profiles/arnaud »), pour la console uniquement. */
  readonly request: string
  issues?: ValidationIssue[]

  constructor(kind: ApiErrorKind, message: string, status: number | undefined, context: { label: string; cause?: unknown }) {
    super(message, { cause: context.cause })
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.request = context.label
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Message à afficher pour une erreur quelconque. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Serveur du PC injoignable'
}

interface Options<T> {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Vérifie la forme de la réponse : une réponse inattendue n’est jamais affichée. */
  validate: (value: unknown) => value is T
  timeout?: number
}

export async function api<T>(path: string, { method = 'GET', body, validate, timeout = TIMEOUT_MS }: Options<T>): Promise<T> {
  const ctrl = new AbortController()
  const abort = window.setTimeout(() => ctrl.abort(), timeout)
  const label = `${method} ${path}`
  try {
    let res: Response
    try {
      res = await fetch(path, {
        method,
        signal: ctrl.signal,
        cache: 'no-store',
        // Le serveur exige du JSON pour toute requête qui modifie, même sans corps.
        headers: method === 'GET' ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (cause) {
      throw new ApiError('network', 'Serveur du PC injoignable', undefined, { cause, label })
    }
    if (!res.ok) {
      // Le code reste dans la console ; l’écran n’affiche qu’une phrase.
      let detail: unknown
      let issues: ValidationIssue[] | undefined
      try {
        const payload: unknown = await res.json()
        detail = isRecord(payload) ? payload.detail : undefined
        if (isRecord(payload) && Array.isArray(payload.issues)) {
          issues = payload.issues.filter((v): v is ValidationIssue => isRecord(v) && typeof v.message === 'string'
            && Array.isArray(v.path) && v.path.every(p => typeof p === 'string' || typeof p === 'number'))
        }
      } catch {
        detail = undefined
      }
      const message = res.status < 500 && typeof detail === 'string' && detail.length > 0 && detail.length <= 200
        ? detail
        : 'Serveur du PC indisponible'
      const error = new ApiError('http', message, res.status, { label })
      error.issues = issues
      throw error
    }
    let value: unknown
    try {
      value = await res.json()
    } catch (cause) {
      throw new ApiError('format', 'Réponse du serveur invalide', res.status, { cause, label })
    }
    if (!validate(value)) throw new ApiError('format', 'Réponse du serveur invalide', res.status, { label })
    return value
  } finally {
    window.clearTimeout(abort)
  }
}
