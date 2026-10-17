"""Mémoire, contraintes, bilans et conservation des calculs : règles critiques."""
import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from uuid import uuid4
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import insert

from backend.app import create_app
from backend.coach import store, tools, memory, insights, constraints
from backend.coach.runtime import Runtime
from backend.storage.models import RecordedSession, RecordedEntry, ProfileWeight
from backend.recording.metrics import calculate_version, LEGACY_VERSION, VERSION
from backend.training import workouts, energy, profiles
from tests.test_coach import Connected, completed


class InformedCoachTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = create_app(data_root=Path(self.temp.name))
        self.db = self.app.state.database
        self.client = TestClient(self.app, base_url='http://127.0.0.1')
        with self.db.write() as s:
            self.conv = store.create_conversation(s, 'ophelie')['id']
            profiles.update_profile(s, 'ophelie', profiles.ProfileUpdate(weight_kg=70.))

    def tearDown(self):
        self.db.close()
        self.temp.cleanup()

    def turn(self, text, date=None):
        with self.db.write() as s:
            turn, _ = store.reserve(s, 'ophelie', self.conv, store.Send(request_id=uuid4().hex, text=text))
            if date:
                turn = store.save_turn(s, 'ophelie', turn['id'], created_at=date)
            return turn

    def finish(self, turn):
        with self.db.write() as s:
            store.save_turn(s, 'ophelie', turn['id'], status='completed')

    def tool(self, name, args, turn=None, profile='ophelie'):
        return tools.execute(self.db, profile, name, json.dumps(args), user_text=turn['user_text'] if turn else '',
                             turn_id=turn['id'] if turn else None, call_id=uuid4().hex)

    def capture(self, turn, key='comfortable_speed', value=5., content='Allure confortable : 5 km/h'):
        return self.tool('capture_context', {'facts': [{'key': key, 'quote': turn['user_text'],
            'content': content, 'value': value}], 'request': {}}, turn)

    def recording(self, profile='ophelie', mode='reel', phase='completed', feeling=4):
        identifier = uuid4().hex
        programme = workouts.WorkoutInput(name='Marche reçue', items=[{'kind': 'steady', 'sec': 600,
            'speed': 5., 'incline': 0., 'movement': 'walk'}])
        preview = workouts.preview(programme, 70.)
        now = profiles.utc_now()
        with self.db.write() as s:
            s.add(RecordedSession(id=identifier, profile_id=profile, mode=mode, started_at=now, closed_at=now,
                profile_snapshot={'id': profile, 'name': profile, 'weight_kg': 70.},
                workout_snapshot={**programme.model_dump(), **preview}, calculation_version=VERSION,
                checkpoint={'phase': phase, 'active_s': 600, 'wall_s': 600, 'pause_s': 0},
                persisted_at=now, persisted_seq=601, lost_entries=0, feeling=feeling))
            s.flush()
            s.execute(insert(RecordedEntry), [{'session_id': identifier, 'seq': i, 'at': now, 't': float(i),
                'kind': 'sample', 'source': 'ftms', 'data': {'t': i, 'active_s': i, 'phase': 'running',
                    'speed': 5., 'incline': 0., 'counter_m': i, 'block_index': 0, 'movement': 'walk'}} for i in range(601)])
        return identifier

    def test_sourced_memory_survives_long_conversation_and_restart(self):
        old = self.turn('Je marche confortablement à 5 km/h.')
        self.assertNotIn('error', self.capture(old))
        self.finish(old)
        for _ in range(30):
            t = self.turn('Autre échange')
            self.finish(t)
        with self.db.write() as s:
            self.conv = store.create_conversation(s, 'ophelie')['id']
        current = self.turn('Prépare une séance pour maigrir en 30 minutes.')
        context, _ = Runtime(self.db, None).context('ophelie', current)
        fact = context['training_memory']['facts'][0]
        self.assertEqual((fact['value'], fact['source_turn_id']), (5., old['id']))
        other = self.tool('get_profile', {}, profile='arnaud')
        self.assertEqual(other['training_memory']['facts'], [])
        self.db.close()
        self.app = create_app(data_root=Path(self.temp.name))
        self.db = self.app.state.database
        self.assertEqual(self.tool('search_memories', {})['total'], 1)

    def test_correction_old_source_and_forgiving_are_consistent(self):
        old = self.turn('Mon allure confortable est 5 km/h.', '2026-10-01T10:00:00.000+00:00')
        self.capture(old)
        self.finish(old)
        current = self.turn('Mon allure confortable est maintenant 4 km/h.')
        result = self.capture(current, value=4., content='Allure actuelle : 4 km/h')
        self.assertEqual(len(result['memory']['facts']), 1)
        identifier = result['saved_ids'][0]
        with self.db.write() as s:
            memory.forget(s, 'ophelie', identifier)
        self.assertEqual(self.tool('search_memories', {})['total'], 0)
        self.assertIn('error', self.capture(current, value=4.))
        with self.db.transaction() as s:
            self.assertNotIn(current['user_text'], memory.redacted(s, 'ophelie', current['user_text']))
        self.assertIn('error', self.tool('capture_context', {'facts': [{'key': 'comfortable_speed',
            'content': 'Ancienne allure', 'quote': old['user_text'], 'source_turn_id': old['id'], 'value': 5.}], 'request': {}}, current))

    def test_bad_quote_numeric_value_and_profile_are_rejected_atomically(self):
        turn = self.turn('Je marche à 5 km/h.')
        self.assertIn('error', self.capture(turn, value=10.))
        self.assertEqual(self.tool('search_memories', {})['total'], 0)
        self.assertIn('error', self.tool('capture_context', {'facts': [], 'request': {}}, turn, 'arnaud'))

    def test_one_workout_request_does_not_become_a_permanent_preference(self):
        turn = self.turn('Prépare une séance de 30 minutes. Ne l’enregistre pas.')
        result = self.tool('capture_context', {'facts': [
            {'key': 'preferred_duration', 'content': 'Préférence 30 min', 'quote': 'une séance de 30 minutes', 'value': 1800.},
            {'key': 'preference', 'content': 'Ne pas enregistrer', 'quote': 'Ne l’enregistre pas.'}], 'request': {}}, turn)
        self.assertEqual(result['saved_ids'], [])
        self.assertEqual(len(result['skipped']), 2)
        self.assertEqual(result['request']['max_duration_sec'], 1800)

    def test_explicit_comfortable_speed_is_saved_before_inference(self):
        old = self.turn('Mon allure confortable est de 5 km/h.')
        self.finish(old)
        current = self.turn('Mon allure confortable est maintenant 4,2 km/h.')
        # Aucun appel au modèle ni bouton « Mémoriser » n'est requis pour cette déclaration.
        facts = self.tool('get_profile', {})['training_memory']['facts']
        self.assertEqual(len(facts), 1)
        self.assertEqual((facts[0]['value'], facts[0]['source_turn_id']), (4.2, current['id']))

    def test_questionnaire_speed_range_is_sourced_and_keeps_running(self):
        turn = self.turn('Allure de footing facile : 6–7 km/h')
        result = self.tool('capture_context', {'facts': [{'key': 'comfortable_speed',
            'quote': '6–7 km/h', 'content': 'Footing facile entre 6 et 7 km/h.',
            'value': 6.5, 'gait': 'run'}]}, turn)
        self.assertNotIn('error', result)
        fact = result['memory']['facts'][0]
        self.assertEqual((fact['value'], fact['value_range'], fact['quote']), (6.5, [6., 7.], '6–7 km/h'))
        with self.db.transaction() as session:
            self.assertNotIn('max_speed', memory.limits(session, 'ophelie'))
        programme = self.tool('recommend_workout', {'goal': 'cardio', 'duration_sec': 1800}, turn)
        self.assertNotIn('needs_clarification', programme)
        running = [b for b in programme['blocks'] if b['kind'] == 'run']
        self.assertTrue(running)
        self.assertTrue(all(b['movement'] == 'run' and b['speed'] == 6.5 for b in running))
        identifier = fact['id']
        response = self.client.patch(f'/api/profiles/ophelie/coach/memories/{identifier}',
                                     json={'content': 'Footing facile : 7 km/h'})
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('value_range', response.json()['details'])

    def test_speed_range_does_not_accept_unquoted_speed_or_effort_rating(self):
        for quote, value in [('6-7 kmh', 8.), ('6–7/10', 6.5)]:
            with self.subTest(quote=quote):
                turn = self.turn('Mon repère : ' + quote)
                self.assertIn('error', self.capture(turn, value=value))
                self.assertEqual(self.tool('search_memories', {})['total'], 0)
                self.finish(turn)
        self.assertEqual(constraints.speed_ranges('entre 6 et 7 km/h'), [(6., 7.)])
        self.assertEqual(constraints.speed_ranges('6 à 7 km/h'), [(6., 7.)])

    def test_declared_range_survives_without_inference_and_can_be_edited(self):
        turn = self.turn('Je cours confortablement à 6-7 kmh.')
        fact = self.tool('get_profile', {})['training_memory']['facts'][0]
        self.assertEqual((fact['value'], fact['value_range'], fact['gait']), (6.5, [6., 7.], 'run'))
        response = self.client.patch(f"/api/profiles/ophelie/coach/memories/{fact['id']}",
                                     json={'content': 'Footing facile : 7–8 km/h'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['details']['value_range'], [7., 8.])
        self.assertEqual(response.json()['details']['value'], 7.5)
        self.finish(turn)
        for text in ['Mon allure confortable est 9–7 km/h.', 'Mon allure confortable est 0–20 km/h.']:
            invalid = self.turn(text)
            self.finish(invalid)
        self.assertEqual(self.tool('get_profile', {})['training_memory']['facts'][0]['value'], 7.5)

    def test_recovery_feedback_does_not_change_the_workout_goal(self):
        initial = self.turn('Prépare une séance cardio de 30 minutes.')
        self.finish(initial)
        feedback = self.turn("J'ai bien pu récupérer à 8 km/h, effort 6–7/10.")
        self.assertEqual(feedback['request_context']['goal'], 'cardio')
        self.finish(feedback)
        recovery = self.turn('Prépare une séance de récupération pour demain.')
        self.assertEqual(recovery['request_context']['goal'], 'recovery')

    def test_current_weight_is_dated_and_history_is_preserved(self):
        with self.db.write() as s:
            profiles.update_profile(s, 'ophelie', profiles.ProfileUpdate(weight_kg=69.5))
        with self.db.transaction() as s:
            current = profiles.get_profile(s, 'ophelie')
            self.assertIsNotNone(current.weight_updated_at)
            history = list(s.query(ProfileWeight).filter_by(profile_id='ophelie'))
            self.assertEqual([r.weight_kg for r in history], [70., 69.5])

    def test_manual_correction_changes_the_effective_numeric_limit(self):
        turn = self.turn('Je ne veux pas dépasser 6 km/h.')
        result = self.capture(turn, key='max_speed', value=6., content='Vitesse maximale : 6 km/h')
        identifier = result['saved_ids'][0]
        response = self.client.patch(f'/api/profiles/ophelie/coach/memories/{identifier}', json={'content': 'Vitesse maximale : 4 km/h'})
        self.assertEqual(response.status_code, 200)
        with self.db.transaction() as s:
            self.assertEqual(memory.limits(s, 'ophelie')['max_speed'], 4.)
        bad = self.client.patch(f'/api/profiles/ophelie/coach/memories/{identifier}', json={'content': 'Un nombre inconnu'})
        self.assertEqual(bad.status_code, 409)

    def test_temporary_state_expires_and_restriction_needs_confirmation(self):
        old = self.turn('Je suis fatiguée aujourd’hui.', (datetime.now(timezone.utc) - timedelta(days=2)).isoformat())
        self.capture(old, key='daily_state', value=None, content='Fatigue déclarée')
        self.finish(old)
        turn = self.turn('Je ressens une gêne au genou.')
        result = self.capture(turn, key='restriction', value=None, content='Gêne au genou déclarée')
        self.assertTrue(next(f['expired'] for f in result['memory']['facts'] if f['key'] == 'daily_state'))
        restriction = result['saved_ids'][0]
        self.assertEqual(next(f['status'] for f in result['memory']['facts'] if f['id'] == restriction), 'pending')
        response = self.client.post(f'/api/profiles/ophelie/coach/memories/{restriction}/confirm', json={})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'active')

    def test_time_and_personal_limits_cannot_be_overridden_by_generated_payload(self):
        turn = self.turn('Une séance de 30 minutes maximum, sans course.')
        proposal = {'workout': {'name': 'Trop longue', 'goal': 'endurance', 'level': 'easy', 'items': [
            {'kind': 'warmup', 'sec': 300, 'speed': 3., 'incline': 0.},
            {'kind': 'steady', 'sec': 2100, 'speed': 4., 'incline': 0.},
            {'kind': 'cooldown', 'sec': 300, 'speed': 3., 'incline': 0.}]},
            'duration_sec': 2700, 'explanation': 'Séance'}
        result = self.tool('validate_workout', proposal, turn)
        self.assertFalse(result['valid'])
        self.assertIn('1800', result['error'])
        self.assertIn('error', self.tool('propose_workout', proposal, turn))
        bad = self.tool('capture_context', {'facts': [], 'request': {'max_duration_sec': 2700,
                           'duration_quote': '30 minutes'}}, turn)
        self.assertIn('error', bad)

    def test_history_has_exact_metrics_sources_samples_and_profile_isolation(self):
        identifier = self.recording()
        self.recording(mode='simulation')
        page = self.tool('list_sessions', {})
        self.assertEqual((page['total'], page['items'][0]['id']), (1, identifier))
        detail = self.tool('get_session', {'session_id': identifier})
        with self.db.transaction() as s:
            expected = insights.service.read(s, 'ophelie', identifier)['metrics']
        self.assertEqual(detail['metrics'], expected)
        self.assertEqual(detail['source']['href'], f'#/bilans/{identifier}')
        self.assertIn('error', self.tool('get_session', {'session_id': identifier}, profile='arnaud'))
        samples = self.tool('get_session_samples', {'session_id': identifier, 'limit': 2})
        self.assertEqual((samples['total'], samples['next_offset'], samples['partial']), (601, 2, True))
        self.assertEqual(self.tool('get_progress', {})['total_sessions'], 1)

    def test_old_session_is_retrievable_but_does_not_prove_current_capacity(self):
        identifier = self.recording()
        with self.db.write() as s:
            s.get(RecordedSession, identifier).started_at = '2025-01-01T10:00:00.000+00:00'
        self.assertEqual(self.tool('list_sessions', {})['items'][0]['id'], identifier)
        self.assertEqual(self.tool('get_profile', {})['activities']['observations'], [])

    def test_minimum_calories_is_enforced_even_if_model_omits_it(self):
        turn = self.turn('Prépare trente minutes avec au moins 350 kcal.')
        result = self.tool('recommend_workout', {'goal': 'fat_loss', 'duration_sec': 1800}, turn)
        checked = self.tool('validate_workout', {'workout': result['workout'], 'duration_sec': 1800,
            'explanation': 'Une base de marche'}, turn)
        self.assertFalse(checked['valid'])
        self.assertEqual(checked['min_active_kcal'], 350)

    def test_recommendation_uses_received_effort_and_respects_request(self):
        identifier = self.recording()
        turn = self.turn('Prépare une séance cardio de 30 minutes.')
        result = self.tool('recommend_workout', {'goal': 'cardio', 'duration_sec': 2700}, turn)
        self.assertEqual(result['summary']['sec'], 1800)
        self.assertEqual(result['reference_session']['id'], identifier)
        self.assertEqual(result['summary']['maxSpeed'], 5.)
        self.assertFalse(result['saved'])
        self.assertGreater(result['summary']['energy']['active_kcal'], 0)

    def test_energy_ambiguity_does_not_rewrite_historical_calculation(self):
        inputs = [{'speed': 6.1, 'incline': 0, 'sec': 1800}]
        new = energy.estimate(inputs, 70.)['energy']
        self.assertIsNone(new['active_kcal'])
        self.assertEqual((new['active_kcal_low'], new['active_kcal_high']), (106.8, 213.5))
        self.assertEqual(energy.estimate_legacy(inputs, 70.)['energy']['active_kcal'], 213.5)
        samples = [{'t': 0, 'active_s': 0, 'speed': 6.1, 'incline': 0, 'counter_m': 0, 'phase': 'running'},
                   {'t': 1, 'active_s': 1, 'speed': 6.1, 'incline': 0, 'counter_m': 1, 'phase': 'running'}]
        old = calculate_version(LEGACY_VERSION, samples, {'active_s': 1}, 70., [{}])
        new = calculate_version(VERSION, samples, {'active_s': 1}, 70., [{}])
        self.assertEqual(old['energy']['active_kcal'], .1)
        self.assertIsNone(new['energy']['active_kcal'])
        self.assertNotIn('movement_ambiguous', old['energy'])

    def test_required_preparation_and_session_source_reach_the_stream(self):
        identifier = self.recording()
        async def run():
            runtime = Runtime(self.db, Connected())
            payloads = []
            async def transport(token, payload):
                payloads.append(payload)
                if len(payloads) == 1:
                    self.assertEqual(payload['tool_choice'], 'required')
                    self.assertEqual([t['name'] for t in payload['tools'][0]['tools']], ['capture_context'])
                    yield completed([{'type': 'function_call', 'name': 'capture_context', 'namespace': 'fitness',
                        'call_id': 'capture', 'arguments': '{"facts":[],"request":{}}'}])
                elif len(payloads) == 2:
                    yield completed([{'type': 'function_call', 'name': 'get_session', 'namespace': 'fitness',
                        'call_id': 'session', 'arguments': json.dumps({'session_id': identifier})}])
                else:
                    yield {'type': 'response.output_text.delta', 'delta': 'Voici le bilan consulté.'}
                    yield completed()
            runtime.transport = transport
            turn, fresh = await runtime.start('ophelie', self.conv, store.Send(request_id=uuid4().hex, text='Mon bilan'))
            frames = [f async for f in runtime.stream('ophelie', turn, fresh)]
            final = json.loads(frames[-1][6:])
            self.assertEqual(final['status'], 'completed')
            self.assertEqual(final['sources'][0]['href'], f'#/bilans/{identifier}')
        asyncio.run(run())

    def test_last_tool_round_keeps_a_final_answer_without_more_tools(self):
        async def run():
            runtime = Runtime(self.db, Connected())
            payloads = []
            async def transport(token, payload):
                payloads.append(payload)
                step = len(payloads)
                if step <= 8:
                    name = 'capture_context' if step == 1 else 'get_profile'
                    args = '{"facts":[],"request":{}}' if step == 1 else '{}'
                    yield completed([{'type': 'function_call', 'name': name, 'namespace': 'fitness',
                        'call_id': f'call_{step}', 'arguments': args}])
                else:
                    self.assertNotIn('tools', payload)
                    yield {'type': 'response.output_text.delta', 'delta': 'Voici les résultats reçus et leurs limites.'}
                    yield completed()
            runtime.transport = transport
            turn, fresh = await runtime.start('ophelie', self.conv, store.Send(request_id=uuid4().hex, text='Mon bilan'))
            frames = [f async for f in runtime.stream('ophelie', turn, fresh)]
            final = json.loads(frames[-1][6:])
            self.assertEqual((final['status'], final['error']), ('completed', None))
            self.assertEqual(len(payloads), 9)
            self.assertIn('résultats reçus', final['answer'])
        asyncio.run(run())
