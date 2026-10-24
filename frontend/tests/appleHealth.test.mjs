import assert from 'node:assert/strict'
import test from 'node:test'
import { APPLE_SHORTCUT_NAME, appleExportIssue, appleShortcutUrl, appleWorkout } from '../src/lib/appleHealth.ts'

const recording = () => ({
  id: 'session-1', mode: 'reel', closed: true, phase: 'completed', lost_entries: 0,
  started_at: '2026-10-24T10:30:00+02:00', checkpoint: { stop_confirmed: true },
  profile: { name: 'Profil privé', weight_kg: 80 },
  metrics: { active_s: 900.4, pause_s: 120, wall_s: 1020.4, distance_m: 1520.5,
    distance_quality: 'complete', coverage: { energy: 1 },
    energy: { active_kcal: 83.2, total_kcal: 105.1, movement_ambiguous: false } },
})

test('envoie la durée active, les kcal actives et la date avec fuseau ; exclut le profil', () => {
  assert.deepEqual(appleWorkout(recording()), {
    version: 1, seance: 'session-1', debut: '2026-10-24T08:30:00.000Z',
    duree_secondes: 900, distance_metres: 1520.5, calories_actives: 83.2,
  })
})

test('refuse simulation, séance ouverte, arrêt incertain, données perdues et durée/date invalides', () => {
  for (const change of [
    r => { r.mode = 'simulation' }, r => { r.closed = false },
    r => { r.phase = 'interrupted' }, r => { r.phase = 'cancelled' },
    r => { r.checkpoint.stop_confirmed = false }, r => { r.lost_entries = 1 },
    r => { r.metrics.active_s = 0 }, r => { r.metrics.active_s = NaN },
    r => { r.metrics.active_s = Infinity }, r => { r.started_at = 'date invalide' },
  ]) {
    const r = recording(); change(r)
    assert.ok(appleExportIssue(r))
    assert.throws(() => appleWorkout(r))
  }
  const stopped = recording(); stopped.phase = 'stopped'
  assert.equal(appleExportIssue(stopped), null)
})

test('omet les valeurs partielles, absentes, non finies ou ambiguës sans les remplacer par zéro', () => {
  for (const change of [
    r => { r.metrics.distance_quality = 'partial'; r.metrics.coverage.energy = .9999 },
    r => { r.metrics.distance_m = null; r.metrics.energy.active_kcal = null },
    r => { r.metrics.distance_m = NaN; r.metrics.energy.active_kcal = Infinity },
    r => { r.metrics.distance_m = -1; r.metrics.energy.movement_ambiguous = true },
  ]) {
    const r = recording(); change(r)
    const payload = appleWorkout(r)
    assert.equal('distance_metres' in payload, false)
    assert.equal('calories_actives' in payload, false)
  }
  const zero = recording(); zero.metrics.distance_m = 0; zero.metrics.energy.active_kcal = 0
  assert.equal(appleWorkout(zero).distance_metres, 0)
  assert.equal(appleWorkout(zero).calories_actives, 0)
})

test('lien local Apple et JSON échappé sans altérer caractères spéciaux ni dates', () => {
  const r = recording(); r.id = 'séance & # ? + /'
  const payload = appleWorkout(r)
  const url = new URL(appleShortcutUrl(payload))
  assert.equal(url.protocol, 'shortcuts:')
  assert.equal(url.hostname, 'run-shortcut')
  assert.equal(url.searchParams.get('name'), APPLE_SHORTCUT_NAME)
  assert.equal(url.searchParams.get('input'), 'text')
  assert.deepEqual(JSON.parse(url.searchParams.get('text')), payload)
  assert.equal(url.searchParams.has('x-success'), false)
})
