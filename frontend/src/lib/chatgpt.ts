import { api, isRecord } from './api'

export interface ChatGPTState {
  state: 'connected' | 'connecting' | 'disconnected'
  local: boolean
  available: boolean
  account: { id: string; email: string | null; name: string | null } | null
  accounts: { id: string; label: string }[]
  plan_enabled: boolean
  models: { id: string; name: string }[]
  models_loaded: boolean
  selected_model: string | null
  issue: { code: string; message: string } | null
  welcome: boolean
}

const nullableString = (v: unknown) => v === null || typeof v === 'string'
function valid(v: unknown): v is ChatGPTState {
  return isRecord(v) && ['connected', 'connecting', 'disconnected'].includes(String(v.state))
    && typeof v.local === 'boolean' && typeof v.available === 'boolean'
    && typeof v.plan_enabled === 'boolean' && typeof v.models_loaded === 'boolean' && typeof v.welcome === 'boolean'
    && nullableString(v.selected_model)
    && (v.account === null || isRecord(v.account) && typeof v.account.id === 'string'
      && nullableString(v.account.email) && nullableString(v.account.name))
    && (v.issue === null || isRecord(v.issue) && typeof v.issue.code === 'string' && typeof v.issue.message === 'string')
    && Array.isArray(v.accounts) && v.accounts.every(a => isRecord(a) && typeof a.id === 'string' && typeof a.label === 'string')
    && Array.isArray(v.models) && v.models.every(m => isRecord(m) && typeof m.id === 'string' && typeof m.name === 'string')
}

export const readChatGPT = () => api('/api/chatgpt', { validate: valid, timeout: 45_000 })
export const changeChatGPT = (action: 'connect' | 'cancel' | 'disconnect' | 'refresh' | 'account' | 'model' | 'welcome', body = {}) =>
  api(`/api/chatgpt/${action}`, { method: 'POST', body, validate: valid, timeout: 45_000 })
