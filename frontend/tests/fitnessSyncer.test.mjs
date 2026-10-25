import assert from 'node:assert/strict'
import test from 'node:test'
import { fitnessSyncerCalorieOptions, fitnessSyncerDraft, fitnessSyncerExportIssue, fitnessSyncerUrl } from '../src/lib/fitnessSyncer.ts'

const recording = () => ({
  id: 'session-1', mode: 'reel', closed: true, phase: 'completed', lost_entries: 0,
  started_at: '2026-10-24T10:30:01+02:00', checkpoint: { stop_confirmed: true },
  profile: { id: 'profil-prive', name: 'Nom privé', weight_kg: 80 },
  feeling: 7,
  samples: [{ phase: 'running', speed: 7.2, target: 18 }, { phase: 'transitioning', speed: 10.8, target: 18 },
    { phase: 'paused', speed: 20 }, { phase: 'unknown', speed: 99 }, { phase: 'running', speed: null }],
  metrics: { active_s: 900.4, pause_s: 120, wall_s: 1020.4, distance_m: 1520.5,
    distance_quality: 'complete', coverage: { energy: 1, speed: 1, incline: 1 }, speed_avg: 7.2, incline_avg: 2,
    energy: { active_kcal: 83.6, total_kcal: 105.1, movement_ambiguous: false } },
})

test('prépare secondes, kilomètres, millisecondes UTC et calories actives obligatoires', () => {
  const draft = fitnessSyncerDraft(recording(), 'Running')
  assert.equal(draft.date, Date.parse('2026-10-24T08:30:01.000Z'))
  assert.equal(draft.duration, 900)
  assert.equal(draft.distanceKM, 1.5205)
  assert.equal(draft.title, 'FitnessApp · Course sur tapis')
  assert.equal(draft.calories, 84)
  assert.match(draft.comment, /Pauses exclues \(120 s\), chronologie non transmise/)
  // Un résumé ne sait pas préserver les événements de pause ni leur fin réelle.
  assert.equal('endDate' in draft, false)
})

test('refuse les calories absentes ou incomplètes, sans les remplacer par le total', () => {
  assert.equal(fitnessSyncerDraft(recording(), 'Walking').calories, 84)
  assert.match(fitnessSyncerDraft(recording(), 'Walking').comment, /actives estimées, sans repos/)
  for (const change of [
    r => { r.metrics.coverage.energy = .99 },
    r => { r.metrics.energy.movement_ambiguous = true },
    r => { r.metrics.energy.active_kcal = null },
    r => { r.metrics.energy.active_kcal = NaN },
    r => { r.metrics.energy.active_kcal = Infinity },
    r => { r.metrics.energy.active_kcal = -1 },
  ]) {
    const r = recording(); change(r)
    assert.ok(fitnessSyncerExportIssue(r))
    assert.throws(() => fitnessSyncerDraft(r, 'Running'), /Calories/)
  }
})

test('la plage calorique impose un choix explicite et conserve son incertitude', () => {
  const r = recording()
  r.metrics.energy = { movement_ambiguous: true, active_kcal: null, active_kcal_low: 393.6, active_kcal_high: 460.8, total_kcal: 510, outside_range: true }
  assert.equal(fitnessSyncerExportIssue(r), null)
  assert.throws(() => fitnessSyncerDraft(r, 'Running'), /Choisissez l’estimation/)
  assert.throws(() => fitnessSyncerDraft(r, 'Running', 'single'), /Choisissez l’estimation/)
  assert.equal(fitnessSyncerDraft(r, 'Running', 'low').calories, 394)
  assert.equal(fitnessSyncerDraft(r, 'Walking', 'high').calories, 461)
  assert.match(fitnessSyncerDraft(r, 'Running', 'low').comment, /394–461 kcal ; estimation basse choisie/)
  assert.match(fitnessSyncerDraft(r, 'Running', 'high').comment, /hors du domaine usuel/)
  for (const [low, high] of [[null, 100], [100, NaN], [-1, 100], [100, 90]]) {
    r.metrics.energy.active_kcal_low = low; r.metrics.energy.active_kcal_high = high
    assert.deepEqual(fitnessSyncerCalorieOptions(r), [])
    assert.throws(() => fitnessSyncerDraft(r, 'Running', 'low'))
  }
})

test('vitesses mesurées en m/s, ressenti sur 10 et pente en note, jamais les consignes', () => {
  const draft = fitnessSyncerDraft(recording(), 'Running')
  assert.equal(draft.speed_avg, 2)
  assert.equal(draft.speed_max, 3)
  assert.equal(draft.rpe, 7)
  assert.match(draft.comment, /Pente moyenne mesurée 2 %/)
  assert.match(draft.comment, /maximale des points mesurés 10.8 km\/h/)
  const r = recording()
  r.metrics.coverage.speed = .99; r.metrics.coverage.incline = 0
  r.samples = [{ phase: 'running', speed: null, target: 15 }]; r.feeling = null
  const partial = fitnessSyncerDraft(r, 'Running')
  for (const key of ['speed_avg', 'speed_max', 'rpe']) assert.equal(key in partial, false)
  assert.doesNotMatch(partial.comment, /Pente moyenne/)
  r.metrics.coverage.speed = 1
  for (const invalid of [null, NaN, Infinity, -1]) {
    r.metrics.speed_avg = invalid; r.samples[0].speed = invalid
    assert.equal('speed_avg' in fitnessSyncerDraft(r, 'Running'), false)
    assert.equal('speed_max' in fitnessSyncerDraft(r, 'Running'), false)
  }
  for (const invalid of [NaN, -1, 11, 0, 5.5]) {
    r.feeling = invalid
    assert.equal('rpe' in fitnessSyncerDraft(r, 'Running'), false)
  }
})

test('les distances incomplètes ne deviennent pas zéro ; les vrais zéros restent des valeurs', () => {
  for (const change of [
    r => { r.metrics.distance_quality = 'partial' },
    r => { r.metrics.distance_quality = 'absent' },
    r => { r.metrics.distance_m = null },
    r => { r.metrics.distance_m = -1 },
    r => { r.metrics.distance_m = Infinity },
  ]) {
    const r = recording(); change(r)
    assert.equal(new URL(fitnessSyncerUrl(fitnessSyncerDraft(r, 'Running'))).searchParams.has('distanceKM'), false)
  }
  const r = recording(); r.metrics.distance_m = 0; r.metrics.energy.active_kcal = 0
  const draft = fitnessSyncerDraft(r, 'Walking')
  assert.equal(draft.distanceKM, 0)
  assert.equal(draft.calories, 0)
})

test('refuse les séances non exportables, le fuseau absent, les pauses invalides et les types inconnus', () => {
  for (const change of [
    r => { r.mode = 'simulation' }, r => { r.closed = false },
    r => { r.phase = 'interrupted' }, r => { r.checkpoint.stop_confirmed = false },
    r => { r.lost_entries = 1 }, r => { r.metrics.active_s = 0 },
    r => { r.metrics.active_s = NaN }, r => { r.started_at = 'invalid' },
    r => { r.started_at = '2026-10-24T10:30:01' },
    r => { r.metrics.pause_s = NaN }, r => { r.metrics.pause_s = -1 },
  ]) {
    const r = recording(); change(r)
    assert.ok(fitnessSyncerExportIssue(r))
    assert.throws(() => fitnessSyncerDraft(r, 'Running'))
  }
  assert.throws(() => fitnessSyncerDraft(recording(), 'Cycling'))
  const r = recording(); r.phase = 'stopped'
  assert.equal(fitnessSyncerExportIssue(r), null)
})

test('le même horaire absolu garde sa date même autour du changement d’heure', () => {
  const r = recording()
  r.started_at = '2026-10-25T02:30:00+02:00'
  const before = fitnessSyncerDraft(r, 'Running').date
  r.started_at = '2026-10-25T02:30:00+01:00'
  const after = fitnessSyncerDraft(r, 'Running').date
  assert.equal(after - before, 3600000)
  r.started_at = '2026-10-25T01:30:00Z'
  assert.equal(fitnessSyncerDraft(r, 'Running').date, after)
})

test('URL officielle encodée, champs autorisés seulement, sans profil, poids ni identifiants de compte', () => {
  const r = recording(); r.id = 'séance & # ? + /'
  const draft = fitnessSyncerDraft(r, 'Walking')
  const url = new URL(fitnessSyncerUrl(draft))
  assert.equal(url.origin, 'https://www.fitnesssyncer.com')
  assert.equal(url.pathname, '/notebook-editor')
  assert.equal(url.hash, '')
  assert.deepEqual([...url.searchParams.keys()].sort(), ['activity', 'calories', 'comment', 'date', 'distanceKM', 'duration', 'new', 'taskType', 'title', 'speed_avg', 'speed_max', 'rpe'].sort())
  assert.equal(url.searchParams.get('taskType'), 'Activity')
  assert.equal(url.searchParams.get('date'), String(draft.date))
  assert.equal(url.searchParams.get('comment'), draft.comment)
  assert.equal(url.searchParams.get('title'), draft.title)
  assert.equal(url.searchParams.get('distanceKM'), '1.5205')
  assert.equal(url.searchParams.get('calories'), '84')
  assert.equal(url.searchParams.get('speed_avg'), '2')
  assert.equal(url.searchParams.get('speed_max'), '3')
  assert.equal(url.searchParams.get('rpe'), '7')
  assert.equal(url.toString().includes('profil-prive'), false)
  assert.equal(decodeURIComponent(url.toString()).includes('Nom privé'), false)
})
