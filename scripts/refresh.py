#!/usr/bin/env python3
"""Collect a GitHub repository with the standard library; never publishes or pushes.

GITHUB_TOKEN is optional (public unauthenticated API limits are low). No token is
read from config, written to disk, or printed. See --help for local output paths.
"""
import argparse
from contextlib import contextmanager
import datetime as dt
import fnmatch
import json
import os
from pathlib import Path
import re
import tempfile
import urllib.error
import urllib.parse
import urllib.request


class CollectionError(RuntimeError):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise CollectionError('API redirect refused; use the current repository name')


class GitHub:
    def __init__(self, token=None):
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect)

    def get(self, path):
        if not path.startswith('/repos/') or '..' in path:
            raise CollectionError('Invalid API path')
        headers = {'Accept': 'application/vnd.github+json',
                   'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'contribution-atlas'}
        if self.token:
            headers['Authorization'] = 'Bearer ' + self.token
        request = urllib.request.Request('https://api.github.com' + path, headers=headers)
        try:
            with self.opener.open(request, timeout=60) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            raise CollectionError(f'GitHub HTTP {exc.code}; snapshot not published') from None
        except (urllib.error.URLError, TimeoutError, ValueError):
            raise CollectionError('GitHub request or JSON decoding failed') from None

    def pages(self, path):
        result = []
        page = 1
        while True:
            rows = self.get(path + ('&' if '?' in path else '?') +
                            f'per_page=100&page={page}')
            if not isinstance(rows, list):
                raise CollectionError('Expected an API array')
            result.extend(rows)
            if len(rows) < 100:
                return result
            page += 1


def config_check(config):
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', config.get('repository', '')):
        raise CollectionError('repository must be owner/name')
    for key in ('generatedPatterns', 'excludedCommitShas', 'integrationLabels'):
        value = config.get(key, [])
        if not isinstance(value, list) or not all(isinstance(x, str) for x in value):
            raise CollectionError(key + ' must be an array of strings')
    if not isinstance(config.get('accounts', []), list) or not all(isinstance(x, str) for x in config.get('accounts', [])):
        raise CollectionError('accounts must be an array of GitHub logins')


def identity(user):
    login = (user or {}).get('login')
    bot = (user or {}).get('type') == 'Bot' or bool(re.search(r'\[bot\]$', login or '', re.I))
    return {'author': login or 'Unlinked identity', 'is_bot': bot,
            'is_human': bool(login) and (user or {}).get('type') == 'User' and not bot,
            'identity_basis': 'github_login' if login else 'git_name_unlinked'}


def commit_record(row, excluded):
    who = identity(row.get('author'))
    return dict(who, sha=row['sha'], date=row['commit']['author']['date'],
                message=row['commit']['message'], parents=[p['sha'] for p in row['parents']],
                is_root_import=not row['parents'] or row['sha'] in excluded,
                excluded_from_credit=row['sha'] in excluded, url=row['html_url'])


def collect(api, config, previous=None, full=False):
    """Return (publishable snapshot, cumulative private cache); no disk mutation."""
    config_check(config)
    base = '/repos/' + config['repository']
    meta = api.get(base)
    if meta.get('private'):
        raise CollectionError('Refusing to create a public-facing snapshot of a private repository')
    old = previous or {}
    if old and old.get('repository') != config['repository']:
        raise CollectionError('Cache belongs to another repository; choose a new cache path')
    branch_path = base + '/branches/' + urllib.parse.quote(meta['default_branch'], safe='')
    head = api.get(branch_path)['commit']['sha']
    excluded = set(config.get('excludedCommitShas', []))
    rows = api.pages(base + '/commits?sha=' + urllib.parse.quote(head, safe=''))
    commits = {r['sha']: commit_record(r, excluded) for r in rows}
    if head not in commits:
        raise CollectionError('Pinned branch head missing from commit listing')
    if any(parent not in commits for c in commits.values() for parent in c['parents']):
        raise CollectionError('Commit graph is incomplete: a reachable parent is missing')
    # API returns each SHA once; dictionary also guards against duplicate page rows.
    history = dict(old.get('commit_history', {}))
    history.update(commits)
    all_prs = api.pages(base + '/pulls?state=all&sort=created&direction=asc')
    if len({p['number'] for p in all_prs}) != len(all_prs):
        raise CollectionError('PR pagination changed during collection; retry')
    cache = {}
    prs, reviews = [], []
    reused_reviews = 0
    for raw in all_prs:
        number = raw['number']
        fingerprint = [raw['updated_at'], raw.get('head', {}).get('sha'), raw['state'], raw.get('merged_at')]
        stored = old.get('pull_requests', {}).get(str(number), {})
        if not full and stored.get('fingerprint') == fingerprint:
            files_raw, review_raw = stored['files'], stored['reviews']
            reused_reviews += 1
        else:
            detail = api.get(base + f'/pulls/{number}')
            files_raw = api.pages(base + f'/pulls/{number}/files')
            if detail['changed_files'] > 3000 or len(files_raw) != detail['changed_files']:
                raise CollectionError(f'PR #{number} file list incomplete (GitHub caps at 3000)')
            review_raw = api.pages(base + f'/pulls/{number}/reviews')
            if detail['updated_at'] != raw['updated_at']:
                raise CollectionError('PR changed during collection; retry')
        cache[str(number)] = dict(fingerprint=fingerprint, files=files_raw, reviews=review_raw)
        files = []
        for f in files_raw:
            item = {k: f[k] for k in ('filename', 'status', 'additions', 'deletions', 'changes')}
            item['excluded_from_churn'] = any(fnmatch.fnmatchcase(f['filename'], pattern)
                                               for pattern in config.get('generatedPatterns', []))
            files.append(item)
        labels = {x['name'].casefold() for x in raw.get('labels', [])}
        integration = bool(labels & {x.casefold() for x in config.get('integrationLabels', [])})
        pr = dict(identity(raw.get('user')), number=number, title=raw['title'], body=raw.get('body') or '',
                  created_at=raw['created_at'], updated_at=raw['updated_at'], merged_at=raw.get('merged_at'),
                  state=raw['state'], files=files, is_integration=integration, url=raw['html_url'])
        for field in ('additions', 'deletions'):
            pr['filtered_' + field] = sum(f[field] for f in files if not f['excluded_from_churn'])
        prs.append(pr)
        for r in review_raw:
            who = identity(r.get('user'))
            reviews.append(dict(who, id=r['id'], pr_number=number, pr_author=pr['author'],
                                user={'login': who['author'], 'type': 'Bot' if who['is_bot'] else 'User' if who['is_human'] else 'Unresolved'},
                                login=who['author'], submitted_at=r.get('submitted_at'), state=r['state'],
                                url=r.get('html_url')))
    final_prs = api.pages(base + '/pulls?state=all&sort=created&direction=asc')
    if sorted(all_prs, key=lambda p: p['number']) != sorted(final_prs, key=lambda p: p['number']):
        raise CollectionError('PR metadata changed during collection; retry')
    final_meta = api.get(base)
    if final_meta.get('private') or final_meta['default_branch'] != meta['default_branch']:
        raise CollectionError('Repository visibility or default branch changed; retry')
    if api.get(branch_path)['commit']['sha'] != head:
        raise CollectionError('Default branch moved during collection; retry')
    stamp = dt.datetime.now(dt.timezone.utc).isoformat()
    snapshot = dict(schema_version=1, title=config.get('title', config['repository']),
                    config={'title': config.get('title', config['repository']), 'accounts': config.get('accounts', [])}, generated_at=stamp,
                    repository={k: meta[k] for k in ('full_name', 'default_branch', 'html_url', 'created_at')},
                    coverage=dict(commits_complete=True, prs_complete=True, files_complete=True,
                                  reviews_complete=not bool(reused_reviews), reviews_pagination_complete=True,
                                  cached_review_prs=reused_reviews, default_branch_sha=head,
                                  review_refresh='full' if full else 'updated_pr_cache',
                                  history_note='Only current default-branch reachable commits are scored; previously observed history is preserved separately in the local cache.',
                                  notes=['Commit totals cover unique SHAs reachable from the pinned default-branch head.',
                                         'Root/import commits are excluded from ordinary credit. Integration PRs are label-based.',
                                         'Unchanged PR file/review lists may be cached; use --full to reconcile review edits or dismissals.',
                                         'GitHub REST is not a transactional snapshot; refresh again after concurrent PR activity.']),
                    commits=list(commits.values()), prs=prs, reviews=reviews)
    state = dict(schema_version=1, repository=config['repository'], generated_at=stamp,
                 commit_history=history, pull_requests=cache)
    return snapshot, state


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent,
                                         prefix='.' + path.name + '.', delete=False) as handle:
            temp = Path(handle.name)
            json.dump(value, handle, ensure_ascii=False, separators=(',', ':'))
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, path)
    finally:
        if temp is not None and temp.exists():
            temp.unlink()


@contextmanager
def cache_lock(path):
    """Nonblocking POSIX advisory lock; kernel releases it even after a crash.

    Never unlink the lock: deleting a locked inode permits two independent locks.
    The lock is acquired before reading the cache, and held through publication.
    """
    try:
        import fcntl
    except ImportError:
        raise CollectionError('Refresh locking requires a POSIX host (Linux/macOS)') from None
    path = Path(path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(str(path) + '.lock', os.O_CREAT | os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise CollectionError('Another refresh holds this cache lock') from None
        yield
    finally:
        os.close(fd)


def same_content(left, right):
    """Timestamps are provenance, not a reason to replace identical evidence."""
    return ({k: v for k, v in left.items() if k != 'generated_at'} ==
            {k: v for k, v in right.items() if k != 'generated_at'})


def publish_if_changed(path, value):
    path = Path(path)
    if path.exists():
        previous = json.loads(path.read_text())
        if same_content(previous, value):
            return False
    atomic_json(path, value)
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', default='atlas.config.json')
    parser.add_argument('--output', default='public/data.json')
    parser.add_argument('--cache', default='.atlas-cache/state.json')
    parser.add_argument('--full', action='store_true', help='Refetch every PR file and review list')
    args = parser.parse_args()
    try:
        if Path(args.output).resolve() == Path(args.cache).resolve():
            raise CollectionError('Output and private cache must be different paths')
        config = json.loads(Path(args.config).read_text())
        cache_path = Path(args.cache)
        with cache_lock(cache_path):
            previous = json.loads(cache_path.read_text()) if cache_path.exists() else None
            snapshot, state = collect(GitHub(os.environ.get('GITHUB_TOKEN')), config, previous, args.full)
            # Archive first. Newer independently fingerprinted cache remains safe
            # if publishing fails; each file has its own atomic replacement.
            publish_if_changed(cache_path, state)
            changed = publish_if_changed(args.output, snapshot)
    except (CollectionError, OSError, ValueError, KeyError, TypeError) as exc:
        print('Refresh failed; existing public snapshot was not replaced. ' + str(exc), file=__import__('sys').stderr)
        return 1
    print(f"{'Wrote' if changed else 'Unchanged'} {args.output}: {len(snapshot['commits'])} commits, {len(snapshot['prs'])} PRs, {len(snapshot['reviews'])} reviews")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
