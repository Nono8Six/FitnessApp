const $ = (id) => document.getElementById(id);
sessionStorage.removeItem('run500-token');
let client = sessionStorage.getItem('run500-client');
if (!client) {
  client = Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, '0')).join('');
  sessionStorage.setItem('run500-client', client);
}
let state = null;
let busy = false;
let online = false;
let devicesSignature = '';
let eventsSignature = '';

function error(message) {
  $('message').textContent = message;
  $('message').hidden = false;
}

async function api(path, body) {
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'X-Poc-Client': client, ...(body === undefined ? {} : {'Content-Type':'application/json'}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(path === 'connect' ? 45000 : path === 'scan' || (path === 'command' && body?.action === 'start') ? 20000 : 15000),
  });
  let data;
  try { data = await response.json(); } catch { throw new Error('Réponse serveur illisible. Vérifier le PC.'); }
  if (!response.ok) {
    const detail = Array.isArray(data.detail) ? data.detail.map((item) => `${item.loc.slice(1).join('.')} : ${item.msg}`).join(' ; ') : data.detail;
    throw new Error(detail || `Erreur serveur (${response.status})`);
  }
  return data;
}

function textElement(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function renderDevices() {
  const list = state.devices.filter((device) => device.candidate || $('all-devices').checked);
  const signature = JSON.stringify(list) + state.phase + busy;
  if (signature === devicesSignature) return;
  devicesSignature = signature;
  $('devices').replaceChildren();
  if (!list.length) {
    if (state.devices.length) $('devices').append(textElement('p', 'Aucun candidat RUN500/FTMS détecté. Vous pouvez afficher les autres appareils.', 'hint'));
    return;
  }
  for (const device of list) {
    const row = textElement('div', '', 'device');
    const name = document.createElement('div');
    name.append(textElement('strong', device.name), textElement('small', `${device.ftms_advertised ? 'FTMS annoncé' : 'FTMS à vérifier après connexion'} · ${device.rssi} dBm · ${device.address}`));
    const button = textElement('button', 'Connecter', 'secondary');
    button.disabled = busy || state.phase !== 'disconnected';
    button.addEventListener('click', () => perform('connect', {address:device.address}));
    row.append(name, button);
    $('devices').append(row);
  }
}

function metric(id, field, format) {
  const value = state.telemetry[field];
  const stale = state.ages[field] === undefined || state.ages[field] > 5 || state.phase !== 'connected';
  $(id).textContent = value == null ? '—' : format(value);
  $(id).classList.toggle('stale', value != null && stale);
  $(id).title = value == null ? 'Donnée non reçue' : stale ? 'Dernière mesure ancienne ou tapis déconnecté' : `Reçu il y a ${state.ages[field]} s`;
}

function render() {
  if (!state) return;
  const connected = online && state.phase === 'connected';
  const active = connected && state.armed && state.owned_by_me && state.control_acquired && !state.desynchronized && !state.audit_error;
  const running = state.workout.phase === 'running';
  const free = !busy && !state.command_pending;
  const phases = {disconnected:'Tapis déconnecté',scanning:'Recherche Bluetooth…',connecting:'Connexion au tapis…',connected:state.device_name || 'Tapis connecté'};
  $('connection').textContent = online ? phases[state.phase] : 'Serveur inaccessible';
  $('connection').className = `connection ${connected ? 'connected' : online ? '' : 'error'}`;
  $('simulation').hidden = state.mode !== 'simulation';
  $('scan').disabled = !online || busy || state.phase !== 'disconnected';
  $('scan').textContent = state.phase === 'scanning' ? 'Recherche en cours…' : 'Rechercher en Bluetooth';
  $('disconnect').disabled = !connected || busy;
  $('arm').disabled = !connected || !free || !state.capabilities.control_point || state.armed || !$('presence').checked || state.desynchronized || !state.restart_ready;
  $('arm').textContent = state.armed ? 'Contrôle activé' : 'Activer le contrôle';
  $('owner-state').textContent = state.desynchronized ? 'Résultat incertain : vérifier le tapis et reconnecter.' : state.armed ? state.owned_by_me ? 'Cet écran possède le contrôle. Gardez-le ouvert pendant le test.' : 'Un autre écran possède le contrôle.' : !state.restart_ready ? state.restart_delay_s ? `Fin de l'arrêt · réactivation possible dans ${state.restart_delay_s} s si la vitesse reste nulle.` : 'En attente d’une nouvelle mesure de vitesse nulle après l’arrêt.' : 'Les commandes sont verrouillées.';
  $('set-speed').disabled = !active || !free || running || !(state.telemetry.speed_kmh > 0) || !state.capabilities.speed_target || !state.capabilities.speed_range;
  $('set-incline').disabled = !active || !free || running || !state.capabilities.incline_target || !state.capabilities.incline_range;
  $('pause').disabled = !connected || !state.control_acquired;
  $('stop').disabled = !connected || !state.control_acquired;
  $('workout').disabled = !active || !free || running || !(state.telemetry.speed_kmh > 0);
  $('custom-workout').disabled = $('workout').disabled;
  $('report').disabled = !online;
  const fresh = connected && state.ages.speed_kmh <= 5 && state.ages.incline_pct <= 5;
  $('measurement-status').textContent = fresh ? 'Mesures reçues · actualisation 1 s' : connected ? 'Mesures absentes ou anciennes' : 'En attente du tapis';
  metric('speed','speed_kmh',(value)=>value.toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:2}));
  metric('incline','incline_pct',(value)=>value.toLocaleString('fr-FR',{maximumFractionDigits:1}));
  metric('distance','distance_m',(value)=>value.toLocaleString('fr-FR'));
  metric('elapsed','elapsed_s',(value)=>`${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}`);
  for (const [kind, id] of [['speed','speed-range'],['incline','incline-range']]) {
    const range = state.capabilities[`${kind}_range`];
    $(id).textContent = range ? `Plage annoncée : ${range.min}–${range.max} · pas ${range.step}` : 'Plage du tapis inconnue';
    if (range) {
      const input = $(kind === 'speed' ? 'target-speed' : 'target-incline');
      input.min = Math.max(0, range.min);
      input.max = Math.min(range.max, state.limits[kind === 'speed' ? 'speed_kmh' : 'incline_pct']);
      input.step = range.step;
    }
  }
  const speedInput = $('target-speed');
  const chosenSpeed = speedInput.valueAsNumber;
  $('start').textContent = Number.isFinite(chosenSpeed) && speedInput.validity.valid ? `Démarrer à ${chosenSpeed.toLocaleString('fr-FR')} km/h` : 'Démarrer à la vitesse choisie';
  $('start').disabled = !active || !free || running || state.telemetry.speed_kmh !== 0 || !state.capabilities.speed_target || !state.capabilities.speed_range || !speedInput.validity.valid;
  $('control-limits').textContent = `Vitesse : ${state.limits.speed_kmh} km/h max · Pente : ${state.limits.incline_pct} % max`;
  $('capabilities').replaceChildren();
  for (const [key, label] of [['treadmill_data','Mesures tapis'],['control_point','Canal de commande'],['speed_target','Vitesse cible'],['incline_target','Pente cible']]) {
    const available = state.capabilities[key];
    $('capabilities').append(textElement('span',`${label} : ${available === undefined ? 'à vérifier' : available ? 'annoncé' : 'absent'}`,available ? '' : 'unavailable'));
  }
  const labels = {idle:'Programme en attente',running:`Bloc ${state.workout.block}/${state.workout.blocks?.length || 3} · ${state.workout.remaining_s} s restantes`,completed:'Programme terminé · arrêt accepté, vérifier la console',interrupted:`Programme interrompu · ${state.workout.reason || ''}`,failed:`Échec · ${state.workout.reason || ''}`};
  $('workout-state').textContent = labels[state.workout.phase] || state.workout.phase;
  const events = state.events.filter((event)=>event.level !== 'data').slice(-25).reverse();
  const signature = JSON.stringify(events);
  if (signature !== eventsSignature) {
    eventsSignature = signature;
    $('events').replaceChildren(...events.map((event)=>{
      const row = textElement('li','',event.level);
      const text = textElement('div',event.message);
      const details = [event.action,event.value==null?'':String(event.value),event.raw?`[${event.raw}]`:'',event.detail||''].filter(Boolean).join(' · ');
      if (details) text.append(textElement('small',details));
      row.append(textElement('time',new Date(event.time).toLocaleTimeString('fr-FR')),text);
      return row;
    }));
  }
  $('services').textContent = state.services.length ? JSON.stringify(state.services,null,2) : state.mode === 'simulation' ? 'Simulation : aucun service matériel découvert.' : 'En attente de la connexion';
  if (state.audit_error) error(state.audit_error);
  renderDevices();
}

async function refresh() {
  try {
    state = await api('state');
    online = true;
    $('workspace').hidden = false;
  } catch (exc) {
    online = false;
    error(exc.name === 'TimeoutError' ? 'Le serveur ne répond plus. Vérifiez le PC et utilisez le STOP physique si nécessaire.' : exc.message);
  }
  render();
}

async function perform(path, body) {
  if (busy && !(path === 'command' && ['pause','stop'].includes(body?.action))) return;
  busy = true;
  $('message').hidden = true;
  render();
  try { await api(path,body); }
  catch (exc) { error(exc.name === 'TimeoutError' ? 'Réponse HTTP absente : résultat inconnu. Vérifiez le journal et la console du tapis avant toute nouvelle action.' : exc.message); }
  finally { busy = false; await refresh(); }
}

$('scan').addEventListener('click',()=>perform('scan',{}));
$('disconnect').addEventListener('click',()=>perform('disconnect',{}));
$('all-devices').addEventListener('change',()=>{devicesSignature='';render();});
$('presence').addEventListener('change',render);
$('arm').addEventListener('click',()=>perform('arm',{present_at_machine:$('presence').checked}));
for (const action of ['pause','stop']) $(action).addEventListener('click',()=>perform('command',{action}));
$('target-speed').addEventListener('input',render);
$('start').addEventListener('click',()=>{
  if ($('target-speed').reportValidity()) perform('command',{action:'start',value:$('target-speed').valueAsNumber});
});
for (const action of ['speed','incline']) $(`${action}-form`).addEventListener('submit',(event)=>{
  event.preventDefault();
  perform('command',{action,value:Number($(action==='speed'?'target-speed':'target-incline').value)});
});
const defaultWorkout = {blocks:[{duration_s:10,speed_kmh:2,incline_pct:0},{duration_s:10,speed_kmh:2.5,incline_pct:1},{duration_s:10,speed_kmh:2,incline_pct:0}]};
$('workout').addEventListener('click',()=>perform('workout',defaultWorkout));
$('custom-workout').addEventListener('click',()=>{
  try { perform('workout',JSON.parse($('workout-json').value)); }
  catch { error('JSON invalide : vérifier les virgules, guillemets et accolades.'); }
});
$('report').addEventListener('click',async()=>{
  try {
    const data=await api('report');
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const link=document.createElement('a'); link.href=url; link.download=`run500-${state.mode}-diagnostic.json`;
    link.click(); setTimeout(()=>URL.revokeObjectURL(url),10000);
  } catch(exc) { error(exc.message); }
});
try {
  const response=await fetch('/api/bootstrap',{cache:'no-store'});
  if (response.ok) {
    const bootstrap=await response.json();
    $('phone-access').hidden=false;
    for (const address of bootstrap.addresses) {
      const link=textElement('a',`http://${address}:${location.port}`); link.href=link.textContent;
      $('addresses').append(link);
    }
    if (bootstrap.network_note) $('addresses').append(textElement('p',bootstrap.network_note,'hint'));
  }
} catch { error('Le PC ne répond pas. Vérifier que le POC est lancé.'); }
async function poll() { await refresh(); setTimeout(poll,1000); }
poll();
document.addEventListener('visibilitychange',()=>{
  if (!document.hidden) refresh();
});
