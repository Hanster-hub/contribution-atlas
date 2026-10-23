"""Offline collector tests: python -m unittest discover -s tests -v."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('refresh', Path(__file__).parents[1] / 'scripts/refresh.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
BASE = '/repos/example/project'
CONFIG = dict(repository='example/project', accounts=[], generatedPatterns=['dist/*'],
              excludedCommitShas=[], integrationLabels=['integration'])


def commit(sha='head', user=None, parents=None):
    return dict(sha=sha, author=user, parents=parents or [], html_url='https://github.com/example/project/commit/' + sha,
                commit=dict(author=dict(date='2026-01-01T00:00:00Z', name='Never infer human'), message='Example'))


class FakeAPI:
    def __init__(self):
        self.head = 'head'
        self.commits = [commit(user={'login': 'octocat', 'type': 'User'})]
        self.pr = dict(number=1, user={'login': 'octocat', 'type': 'User'}, title='Example PR', body='',
                       created_at='2026-01-01T00:00:00Z', updated_at='2026-01-02T00:00:00Z',
                       merged_at=None, state='open', html_url='https://github.com/example/project/pull/1',
                       head={'sha': 'feature'}, labels=[])
        self.files = [dict(filename='dist/output.js', status='added', additions=200, deletions=0, changes=200),
                      dict(filename='src/main.py', status='modified', additions=5, deletions=1, changes=6)]
        self.reviews = [dict(id=1, user={'login': 'reviewer', 'type': 'User'},
                             submitted_at='2026-01-02T00:00:00Z', state='APPROVED')]
        self.calls = []
        self.private = False
        self.changed_files = 2
        self.fail = None

    def get(self, path):
        self.calls.append(path)
        if self.fail and self.fail in path:
            raise r.CollectionError('Injected failure')
        if path == BASE:
            return dict(full_name='example/project', default_branch='main', private=self.private,
                        html_url='https://github.com/example/project', created_at='2026-01-01T00:00:00Z')
        if '/branches/' in path:
            return {'commit': {'sha': self.head}}
        if path.endswith('/pulls/1'):
            return dict(self.pr, changed_files=self.changed_files)
        raise AssertionError(path)

    def pages(self, path):
        self.calls.append(path)
        if self.fail and self.fail in path:
            raise r.CollectionError('Injected failure')
        if '/commits?' in path:
            return copy.deepcopy(self.commits)
        if '/pulls?' in path:
            return [copy.deepcopy(self.pr)]
        if path.endswith('/files'):
            return copy.deepcopy(self.files)
        if path.endswith('/reviews'):
            return copy.deepcopy(self.reviews)
        raise AssertionError(path)


class CollectorTests(unittest.TestCase):
    def test_pagination_fetches_terminal_page(self):
        api = r.GitHub()
        with patch.object(api, 'get', side_effect=[list(range(100)), list(range(100)), [200]]) as get:
            self.assertEqual(len(api.pages(BASE + '/commits?sha=abc')), 201)
            self.assertIn('&per_page=100&page=3', get.call_args.args[0])

    def test_incremental_and_full(self):
        api = FakeAPI()
        snapshot, cache = r.collect(api, CONFIG)
        self.assertEqual(snapshot['prs'][0]['filtered_additions'], 5)
        api.calls.clear()
        r.collect(api, CONFIG, cache)
        self.assertFalse(any(p.endswith(('/files', '/reviews')) for p in api.calls))
        api.pr['updated_at'] = '2026-01-03T00:00:00Z'
        api.calls.clear()
        r.collect(api, CONFIG, cache)
        self.assertTrue(any(p.endswith('/reviews') for p in api.calls))
        api.calls.clear()
        r.collect(api, CONFIG, cache, full=True)
        self.assertTrue(any(p.endswith('/files') for p in api.calls))

    def test_force_push_keeps_archive_not_current_scores(self):
        api = FakeAPI()
        _, old = r.collect(api, CONFIG)
        api.head = 'new'
        api.commits = [commit('new'), commit('new')]
        snapshot, cache = r.collect(api, CONFIG, old)
        self.assertEqual([c['sha'] for c in snapshot['commits']], ['new'])
        self.assertEqual(set(cache['commit_history']), {'head', 'new'})

    def test_identity_never_uses_git_name_as_human(self):
        self.assertFalse(r.commit_record(commit(), set())['is_human'])
        self.assertFalse(r.identity({'login': 'helper', 'type': 'Bot'})['is_human'])
        self.assertFalse(r.identity({'login': 'helper[bot]', 'type': 'User'})['is_human'])
        self.assertTrue(r.identity({'login': 'octocat', 'type': 'User'})['is_human'])

    def test_import_and_integration_exclusions(self):
        api = FakeAPI()
        api.commits[0]['parents'] = [{'sha': 'parent'}]
        api.commits.append(commit('parent'))
        api.pr['labels'] = [{'name': 'Integration'}]
        snapshot, _ = r.collect(api, dict(CONFIG, excludedCommitShas=['head']))
        self.assertTrue(snapshot['commits'][0]['is_root_import'])
        self.assertTrue(snapshot['prs'][0]['is_integration'])

    def test_refuses_private_and_incomplete(self):
        api = FakeAPI()
        api.private = True
        with self.assertRaises(r.CollectionError):
            r.collect(api, CONFIG)
        api.private = False
        for count in (3, 3001):
            api.changed_files = count
            with self.assertRaises(r.CollectionError):
                r.collect(api, CONFIG)

    def test_mid_collection_failure_leaves_published_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / 'config.json'
            config.write_text(json.dumps(CONFIG))
            output = root / 'data.json'
            output.write_text('{"old":true}')
            api = FakeAPI()
            api.fail = '/reviews'
            with patch.object(r, 'GitHub', return_value=api), patch('sys.argv', ['refresh', '--config', str(config), '--output', str(output), '--cache', str(root / 'cache.json')]):
                self.assertEqual(r.main(), 1)
            self.assertEqual(json.loads(output.read_text()), {'old': True})
            self.assertFalse((root / 'cache.json').exists())

    def test_atomic_replace_failure_preserves_previous(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'data.json'
            path.write_text('{"old":true}')
            with patch.object(r.os, 'replace', side_effect=OSError('Injected disk failure')):
                with self.assertRaises(OSError):
                    r.atomic_json(path, {'new': True})
            self.assertEqual(json.loads(path.read_text()), {'old': True})
            self.assertEqual(len(list(Path(directory).iterdir())), 1)

    def test_branch_movement_fails_closed(self):
        api = FakeAPI()
        original = api.get
        calls = 0
        def get(path):
            nonlocal calls
            if '/branches/' in path:
                calls += 1
                if calls == 2:
                    return {'commit': {'sha': 'moved'}}
            return original(path)
        api.get = get
        with self.assertRaises(r.CollectionError):
            r.collect(api, CONFIG)


    def test_incomplete_commit_graph_rejected(self):
        api = FakeAPI()
        api.commits[0]['parents'] = [{'sha': 'missing'}]
        with self.assertRaises(r.CollectionError):
            r.collect(api, CONFIG)

    def test_pr_metadata_race_rejected(self):
        api = FakeAPI()
        original = api.pages
        calls = 0
        def pages(path):
            nonlocal calls
            if '/pulls?' in path:
                calls += 1
                if calls == 2:
                    api.pr['title'] = 'Changed concurrently'
            return original(path)
        api.pages = pages
        with self.assertRaises(r.CollectionError):
            r.collect(api, CONFIG)

    def test_pending_records_preserved_and_cache_coverage_honest(self):
        api = FakeAPI()
        api.reviews.append(dict(id=2, user={'login': 'reviewer', 'type': 'User'},
                                state='PENDING', submitted_at=None))
        snapshot, cache = r.collect(api, CONFIG)
        self.assertEqual(len(snapshot['reviews']), 2)
        self.assertTrue(snapshot['coverage']['reviews_complete'])
        cached, _ = r.collect(api, CONFIG, cache)
        self.assertFalse(cached['coverage']['reviews_complete'])
        self.assertTrue(cached['coverage']['reviews_pagination_complete'])
        self.assertEqual(cached['coverage']['cached_review_prs'], 1)

    def test_concurrent_cache_lock_rejected_then_released(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'state.json'
            with r.cache_lock(path):
                with self.assertRaises(r.CollectionError):
                    with r.cache_lock(path):
                        self.fail('Concurrent writer acquired lock')
            with r.cache_lock(path):
                pass
            self.assertEqual((path.parent / 'state.json.lock').stat().st_mode & 0o777, 0o600)

    def test_unchanged_evidence_preserves_timestamp_and_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'data.json'
            self.assertTrue(r.publish_if_changed(path, {'generated_at': 'first', 'commits': [1]}))
            before = path.read_bytes()
            with patch.object(r, 'atomic_json') as write:
                self.assertFalse(r.publish_if_changed(path, {'generated_at': 'second', 'commits': [1]}))
                write.assert_not_called()
            self.assertEqual(path.read_bytes(), before)
            self.assertTrue(r.publish_if_changed(path, {'generated_at': 'third', 'commits': [2]}))


if __name__ == '__main__':
    unittest.main()
