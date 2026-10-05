"""Brique 6 : variantes, provenance, migration, acceptation et conflits critiques."""
import asyncio
import copy
import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from backend.app import create_app
from backend.coach import store, tools, workout_proposals as proposals
from backend.storage.database import alembic_config, create_db_engine
from backend.storage.models import Workout, WorkoutVersion
from backend.training import catalog, workouts
from tests.test_coach import Connected, completed
from backend.coach.runtime import Runtime


class ProposalTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.app = create_app(data_root=self.root)
        self.db = self.app.state.database
        self.client = TestClient(self.app, base_url='http://127.0.0.1')
        self.url = '/api/profiles/arnaud'
        with self.db.write() as s:
            self.conversation = store.create_conversation(s, 'arnaud')['id']

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def proposal(self, target=None):
        payload = {'workout': catalog.variants()[0][2].model_dump(), 'explanation': 'Marche régulière avec échauffement et retour au calme.', 'duration_sec': 1200}
        with self.db.write() as s:
            turn, _ = store.reserve(s, 'arnaud', self.conversation, store.Send(
                request_id=uuid4().hex, text='Crée ou ajuste cette séance', workout_target=target))
        result = tools.execute(self.db, 'arnaud', 'propose_workout', json.dumps(payload),
            user_text=turn['user_text'], turn_id=turn['id'], call_id=uuid4().hex)
        self.assertNotIn('error', result, result)
        with self.db.write() as s:
            store.save_turn(s, 'arnaud', turn['id'], status='completed')
        return result['workout_proposal']

    def test_catalog_variants_copy_and_unknown_calories(self):
        data = self.client.get(self.url + '/workouts/catalog').json()
        self.assertEqual(len(data), 18)
        self.assertEqual(len({w['template_id'] for w in data}), 6)
        for identifier in {w['template_id'] for w in data}:
            variants = [w for w in data if w['template_id'] == identifier]
            self.assertEqual(len({w['summary']['sec'] for w in variants}), 3)
            self.assertEqual(len({json.dumps(w['items']) for w in variants}), 3)
        for variant in data:
            self.assertEqual(variant['blocks'][0]['kind'], 'warmup')
            self.assertEqual(variant['blocks'][-1]['kind'], 'cooldown')
            self.assertIsNone(variant['summary']['energy']['active_kcal'])
            self.assertLessEqual(variant['summary']['sec'], 3600)
        self.client.patch(self.url, json={'weight_kg': 80})
        weighted = self.client.get(self.url + '/workouts/catalog').json()
        self.assertTrue(all(w['summary']['energy']['active_kcal'] > 0 for w in weighted))
        first = self.client.post(self.url + '/workouts/catalog', json={'template_id': data[0]['template_id'], 'level': 'easy'}).json()
        self.assertEqual(first['origin']['kind'], 'catalog')
        self.assertEqual(first['author'], 'human')
        self.client.patch(self.url + '/workouts/' + first['id'], json={'name': 'Personnelle', 'items': first['items'], 'base_version': 1})
        self.assertEqual(self.client.get(self.url + '/workouts/catalog').json(), weighted)
        self.assertEqual(self.client.get('/api/profiles/ophelie/workouts').json()['workouts'], [])
        self.assertIsNone(self.client.get(self.url + '/workouts').json()['selected_id'])

    def test_no_automatic_save_reloads_and_profile_isolation(self):
        p = self.proposal()
        self.assertEqual(self.client.get(self.url + '/workouts').json()['workouts'], [])
        url = self.url + '/coach/workout-proposals/' + p['id']
        self.assertEqual(self.client.get(url).json(), p)
        self.assertEqual(self.client.get(self.url + '/coach/conversations/' + self.conversation).json()['items'][0]['workout_proposals'], [p])
        for suffix in ['', '/accept', '/ignore']:
            call = self.client.get if not suffix else self.client.post
            kwargs = {} if not suffix else {'json': {}}
            self.assertEqual(call(url.replace('arnaud', 'ophelie') + suffix, **kwargs).status_code, 404)
        self.assertEqual(self.client.post(url + '/accept', json={'author': 'chatgpt'}).status_code, 422)
        invalid = copy.deepcopy(catalog.variants()[0][2].model_dump())
        invalid['items'][1]['speed'] = 99
        result = tools.execute(self.db, 'arnaud', 'validate_workout', json.dumps({'workout': invalid, 'explanation': 'Test', 'duration_sec': 1200}), user_text='Test')
        self.assertIn('issues', result)
        self.assertTrue(any('speed' in e['path'] for e in result['issues']))
        duration = tools.execute(self.db, 'arnaud', 'validate_workout', json.dumps({
            'workout': catalog.variants()[0][2].model_dump(), 'explanation': 'Test', 'duration_sec': 1800}), user_text='30 minutes')
        self.assertIn('Durée totale incohérente', duration['issues'][0]['message'])

    def test_concurrent_idempotent_acceptance_and_deleted_result(self):
        p = self.proposal()
        def accept(_):
            with self.db.write() as s:
                return proposals.accept(s, 'arnaud', p['id'], proposals.Acceptance())
        with ThreadPoolExecutor(2) as pool:
            results = list(pool.map(accept, range(2)))
        self.assertEqual(results[0], results[1])
        self.assertEqual(results[0]['author'], 'chatgpt')
        self.assertEqual(results[0]['origin']['conversation_id'], self.conversation)
        with self.db.transaction() as s:
            self.assertEqual(len(list(s.scalars(select(Workout)))), 1)
        self.client.delete(self.url + '/workouts/' + results[0]['id'], headers={'content-type': 'application/json'})
        with self.assertRaises(workouts.WorkoutNotFound):
            accept(None)

    def test_adjustment_exact_version_conflict_refusal_and_human_edit(self):
        with self.db.write() as s:
            first = workouts.create_workout(s, 'arnaud', catalog.variants()[0][2])
        target = workouts.Target(workout_id=first['id'], version=1)
        p = self.proposal(target)
        self.assertEqual(p['base']['items'], first['items'])
        with self.db.write() as s:
            workloads = workouts.WorkoutUpdate(name='Modification concurrente', items=first['items'], base_version=1)
            workouts.update_workout(s, 'arnaud', first['id'], workloads)
        url = self.url + '/coach/workout-proposals/' + p['id']
        self.assertEqual(self.client.post(url + '/accept', json={}).status_code, 409)
        self.assertEqual(self.client.post(url + '/ignore', json={}).status_code, 200)
        self.assertEqual(self.client.post(url + '/accept', json={}).status_code, 409)
        p2 = self.proposal(workouts.Target(workout_id=first['id'], version=2))
        edited = {**p2['workout'], 'name': 'Retouche humaine'}
        edited = {k: edited[k] for k in ['name', 'items', 'goal', 'level']}
        url2 = self.url + '/coach/workout-proposals/' + p2['id']
        saved = self.client.post(url2 + '/accept', json={'edited_workout': edited}).json()
        self.assertEqual((saved['id'], saved['version'], saved['author']), (first['id'], 3, 'human'))
        self.assertEqual(saved['origin']['kind'], 'chatgpt')
        self.assertEqual(self.client.post(url2 + '/accept', json={}).json(), saved)
        self.assertEqual(len(self.client.get(self.url + '/workouts/' + first['id'] + '/versions').json()), 3)

    def test_stream_corrects_validation_then_persists_card(self):
        async def check():
            runtime = Runtime(self.db, Connected())
            valid = {'workout': catalog.variants()[0][2].model_dump(), 'explanation': 'Marche régulière.', 'duration_sec': 1200}
            invalid = copy.deepcopy(valid)
            invalid['workout']['items'][1]['speed'] = 99
            requests = []
            async def transport(token, payload):
                requests.append(payload)
                if len(requests) <= 2:
                    args = invalid if len(requests) == 1 else valid
                    yield completed([{'type': 'function_call', 'name': 'propose_workout', 'namespace': 'fitness',
                                      'call_id': str(len(requests)), 'arguments': json.dumps(args)}])
                else:
                    yield {'type': 'response.output_text.delta', 'delta': 'Voici la proposition.'}
                    yield completed()
            runtime.transport = transport
            turn, fresh = await runtime.start('arnaud', self.conversation, store.Send(request_id=uuid4().hex, text='Crée une séance'))
            frames = [frame async for frame in runtime.stream('arnaud', turn, fresh)]
            last = json.loads(frames[-1][6:])
            self.assertEqual(last['status'], 'completed')
            self.assertIsNone(last['error'])
            self.assertEqual(len(last['workout_proposals']), 1)
            output = next(item for item in requests[1]['input'] if item.get('type') == 'function_call_output')
            self.assertIn('speed', output['output'])
            await runtime.close()
        asyncio.run(check())

    def test_adjustment_accepts_once_and_rejects_forged_target(self):
        with self.db.write() as s:
            first = workouts.create_workout(s, 'arnaud', catalog.variants()[0][2])
            workouts.select_workout(s, 'arnaud', first['id'])
        target = workouts.Target(workout_id=first['id'], version=1)
        p = self.proposal(target)
        def accept(_):
            with self.db.write() as s:
                return proposals.accept(s, 'arnaud', p['id'], proposals.Acceptance())
        with ThreadPoolExecutor(2) as pool:
            results = list(pool.map(accept, range(2)))
        self.assertEqual(results[0], results[1])
        self.assertEqual((results[0]['id'], results[0]['version'], results[0]['author']), (first['id'], 2, 'chatgpt'))
        with self.db.transaction() as s:
            self.assertEqual(len(list(s.scalars(select(WorkoutVersion)))), 2)
            self.assertEqual(workouts.list_workouts(s, 'arnaud')['selected_id'], first['id'])
        other = self.client.post('/api/profiles/ophelie/coach/conversations', json={}).json()['id']
        response = self.client.post('/api/profiles/ophelie/coach/conversations/' + other + '/messages', json={
            'request_id': uuid4().hex, 'text': 'Ajuste', 'workout_target': target.model_dump()})
        self.assertEqual(response.status_code, 404)

    def test_text_never_saves_and_uncorrected_invalid_proposal_is_explicit(self):
        async def check(invalid):
            runtime = Runtime(self.db, Connected())
            calls = 0
            async def transport(token, payload):
                nonlocal calls
                calls += 1
                if invalid and calls == 1:
                    bad = {'workout': {'name': 'Invalide', 'items': []}, 'explanation': 'Erreur', 'duration_sec': 1200}
                    yield completed([{'type': 'function_call', 'name': 'propose_workout', 'call_id': 'invalid', 'arguments': json.dumps(bad)}])
                else:
                    yield {'type': 'response.output_text.delta', 'delta': 'Voici une séance textuelle.'}
                    yield completed()
            runtime.transport = transport
            turn, fresh = await runtime.start('arnaud', self.conversation, store.Send(request_id=uuid4().hex, text='Crée une séance'))
            frames = [f async for f in runtime.stream('arnaud', turn, fresh)]
            last = json.loads(frames[-1][6:])
            self.assertEqual(last['workout_proposals'], [])
            self.assertEqual(last['error'], 'workout_invalid' if invalid else None)
            await runtime.close()
        asyncio.run(check(False))
        asyncio.run(check(True))
        self.assertEqual(self.client.get(self.url + '/workouts').json()['workouts'], [])


class AdditiveMigrationTests(unittest.TestCase):
    def test_upgrade_six_preserves_all_owned_data(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / 'reel'
            data.mkdir()
            engine = create_db_engine(data / 'fitness.db')
            with engine.begin() as connection:
                config = alembic_config()
                config.attributes['connection'] = connection
                command.upgrade(config, '0006')
                connection.execute(text("INSERT INTO profiles VALUES ('p','Personnel',3,'kmh','date','date',80)"))
                connection.execute(text("INSERT INTO workouts VALUES ('w','p','date')"))
                items = json.dumps([{'kind': 'steady', 'sec': 300, 'speed': 4., 'incline': 0.}])
                connection.execute(text("INSERT INTO workout_versions VALUES ('w',1,'Ancienne','human','Personnel',:items,'date')"), {'items': items})
                connection.execute(text("INSERT INTO workout_selections VALUES ('p','w')"))
                connection.execute(text("INSERT INTO coach_conversations VALUES ('c','p','Ancienne','date','date','date')"))
                connection.execute(text("INSERT INTO coach_turns VALUES ('t','p','c','r','Message','Réponse','completed',NULL,'modèle','[]','[]','{}','date','date')"))
                connection.execute(text("INSERT INTO coach_memories VALUES ('m','p','Préférence','t',0,'date','date')"))
                tables = ['profiles', 'workouts', 'workout_versions', 'workout_selections', 'coach_conversations', 'coach_turns', 'coach_memories']
                previous = {table: connection.execute(text('SELECT * FROM ' + table)).mappings().all() for table in tables}
            engine.dispose()
            app = create_app(data_root=root)
            try:
                with app.state.database.transaction() as session:
                    for table in tables:
                        rows = session.execute(text('SELECT * FROM ' + table)).mappings().all()
                        self.assertEqual([{k: row[k] for k in previous[table][0]} for row in rows if row.get('id', 'p') not in ['arnaud', 'ophelie']], previous[table])
                    self.assertEqual(session.execute(text('PRAGMA foreign_key_check')).all(), [])
                personal = TestClient(app, base_url='http://127.0.0.1').get('/api/profiles/p/workouts').json()
                self.assertIsNone(personal['workouts'][0]['goal'])
                self.assertIsNone(personal['workouts'][0]['level'])
            finally:
                app.state.database.close()
