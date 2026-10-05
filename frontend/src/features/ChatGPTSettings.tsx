import { useEffect, useRef, useState } from 'react'
import { Button, Group, Row, Sheet } from '../components/ui'
import { errorMessage } from '../lib/api'
import { changeChatGPT, readChatGPT, type ChatGPTState } from '../lib/chatgpt'

const selectStyle = 'h-11 w-full min-w-0 rounded-[8px] bg-fill-3 px-3 text-body text-label outline-none focus:ring-2 focus:ring-accent disabled:text-label-3'

export function ChatGPTSettings({ readOnly }: { readOnly: boolean }) {
  const [data, setData] = useState<ChatGPTState>()
  const [error, setError] = useState<string>()
  const [readError, setReadError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const mounted = useRef(false)
  const revision = useRef(0)

  useEffect(() => {
    mounted.current = true
    let disposed = false
    let timer: number
    const poll = async () => {
      const current = revision.current
      try {
        const next = await readChatGPT()
        if (!disposed && revision.current === current) { setData(next); setReadError(undefined) }
      } catch (err) {
        if (!disposed && revision.current === current) setReadError(errorMessage(err))
      }
      if (!disposed) timer = window.setTimeout(poll, 2500)
    }
    void poll()
    return () => { disposed = true; mounted.current = false; window.clearTimeout(timer) }
  }, [])

  const act = async (action: Parameters<typeof changeChatGPT>[0], body = {}) => {
    ++revision.current
    setBusy(true); setError(undefined)
    try {
      const next = await changeChatGPT(action, body)
      if (mounted.current) { setData(next); setConfirm(false) }
    } catch (err) {
      if (mounted.current) setError(errorMessage(err))
    } finally {
      ++revision.current
      if (mounted.current) setBusy(false)
    }
  }
  const disabled = busy || readOnly || !!readError || !data?.available
  const connecting = data?.state === 'connecting'
  const connected = data?.state === 'connected'
  const reconnect = data?.issue && ['expired', 'revoked', 'renewal_missing'].includes(data.issue.code)
  const permission = data?.issue?.code === 'permission_missing'

  return <>
    <Group header="ChatGPT" className="mt-9">
      <Row title="Connexion" trailing={<span role="status" className={connected && !data?.issue && !readError && !readOnly ? 'text-green' : undefined}>
        {readError || readOnly ? 'Indisponible' : !data ? 'Chargement…' : connecting ? 'En cours…' : reconnect ? 'À reconnecter' : connected ? 'Connecté' : 'Non connecté'}
      </span>} />
      {data?.account && <Row title={data.account.email || data.account.name || 'Compte ChatGPT'}
        subtitle="Compte partagé sur ce PC" className="break-words" />}
      {data && data.accounts.length > 1 && data.local && <div className="px-4 pt-2 pb-3">
        <label className="mb-2 block text-footnote text-label-2" htmlFor="chatgpt-account">Compte ChatGPT</label>
        <select id="chatgpt-account" className={selectStyle} value={data.account?.id ?? ''} disabled={disabled || connecting}
          onChange={e => void act('account', { id: e.target.value })}>
          {data.accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </div>}
      {connected && data?.plan_enabled && <div className="px-4 pt-2 pb-4">
        <label className="mb-2 block text-footnote text-label-2" htmlFor="chatgpt-model">Modèle</label>
        <select id="chatgpt-model" className={selectStyle} value={data.selected_model ?? ''}
          disabled={disabled || !data.models_loaded || data.models.length === 0 || !!reconnect}
          onChange={e => void act('model', { id: e.target.value })}>
          <option value="" disabled>{!data.models_loaded ? data.issue ? 'Liste indisponible' : 'Chargement des modèles…' : data.models.length ? 'Choisir un modèle' : 'Aucun modèle disponible'}</option>
          {data.models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <p className="mt-2 text-footnote text-label-2">Utilise votre forfait ChatGPT.</p>
        {data.issue && data.models_loaded && <p className="mt-1 text-footnote text-label-2">Dernière liste reçue. Actualisez-la lorsque la connexion est rétablie.</p>}
      </div>}
      <div className="space-y-3 px-4 pt-2 pb-4">
        {error && <p role="alert" className="text-footnote text-red">{error}</p>}
        {readError && <p role="alert" className="text-footnote text-red">{readError}</p>}
        {data?.issue && <p role="status" className="text-footnote text-label-2">{data.issue.message}</p>}
        {connecting && <p className="text-subhead text-label-2">Terminez la connexion dans le navigateur du PC, puis revenez ici.</p>}
        {data && !data.local && <p className="text-subhead text-label-2">{connected
          ? 'Pour gérer la connexion, ouvrez FitnessApp sur le PC.'
          : 'Connexion depuis le PC : connectez ChatGPT dans FitnessApp sur le PC. Le téléphone utilisera ensuite cette connexion.'}</p>}
        {data?.local && !connecting && (!connected || reconnect || permission) && <>
          {!data.account && <p className="text-subhead text-label-2">Connectez votre compte pour utiliser votre forfait ChatGPT éligible.</p>}
          <Button variant="gray" className="w-full" disabled={disabled}
            onClick={() => void act('connect', { account_id: data.account?.id ?? null, consent: !!permission })}>
            {busy ? 'Ouverture…' : permission ? 'Autoriser le forfait ChatGPT' : 'Continuer avec ChatGPT'}
          </Button>
        </>}
        {data?.local && connecting && <Button variant="gray" className="w-full" disabled={busy || readOnly}
          onClick={() => void act('cancel')}>Annuler la connexion</Button>}
        {connected && !connecting && <Button variant="gray" size="md" className="w-full" disabled={disabled}
          onClick={() => void act('refresh')}>{busy ? 'Actualisation…' : 'Actualiser les modèles'}</Button>}
        {data?.local && data.account && !connecting && <div className="flex flex-wrap justify-between gap-x-4">
          <Button variant="plain" size="md" disabled={disabled} onClick={() => void act('connect')}>Autre compte</Button>
          {connected && <Button variant="plain" size="md" className="text-red" disabled={disabled}
            onClick={() => setConfirm(true)}>Se déconnecter</Button>}
        </div>}
        {(connected || data?.issue?.code === 'remote_revocation_unconfirmed') && <a href="https://chatgpt.com/settings/usage"
          target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-subhead text-accent">Gérer l’utilisation dans ChatGPT</a>}
      </div>
    </Group>
    <Sheet open={confirm} onClose={() => { if (!busy) setConfirm(false) }} title="Déconnecter ChatGPT">
      <p className="text-subhead text-label-2">Le compte sera déconnecté pour tous les appareils utilisant ce PC. Vos profils et séances seront conservés.</p>
      {error && <p role="alert" className="mt-3 text-footnote text-red">{error}</p>}
      <Button variant="danger" className="mt-6 w-full" disabled={busy} onClick={() => void act('disconnect')}>{busy ? 'Déconnexion…' : 'Se déconnecter'}</Button>
      <Button variant="plain" className="mt-2 w-full" disabled={busy} onClick={() => setConfirm(false)}>Annuler</Button>
    </Sheet>
    <Sheet open={!!data?.welcome && !confirm} onClose={() => { if (!busy) void act('welcome') }} title="Votre forfait ChatGPT">
      <p className="text-subhead text-label-2">Les demandes à ChatGPT utiliseront votre forfait ou les crédits que vous autorisez. Vous pouvez gérer cet accès dans les réglages ChatGPT.</p>
      {error && <p role="alert" className="mt-3 text-footnote text-red">{error}</p>}
      <Button className="mt-6 w-full" disabled={busy} onClick={() => void act('welcome')}>Compris</Button>
    </Sheet>
  </>
}
