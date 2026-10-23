# Local GitHub collector

Run from the project root:

```sh
python3 scripts/refresh.py
# Periodically reconcile review dismissals/edits even on unchanged PRs:
python3 scripts/refresh.py --full
python3 -m unittest discover -s tests -v
```

Only Python's standard library is required; the CLI lock requires Linux/macOS (POSIX). `GITHUB_TOKEN` is the sole optional
credential source. Use a read-only token scoped to the intended repository.
Unauthenticated public reads work subject to GitHub rate limits. Requests are
GET-only against `api.github.com`; redirects are refused. HTTP failures, rate
limits, malformed responses and incomplete file lists stop publication rather
than substitute zeroes. No credentials are stored or logged.

## Configuration

`atlas.config.json` has this shape (example identifiers only):

```json
{
  "repository": "example/project",
  "title": "Contribution Atlas",
  "accounts": [],
  "generatedPatterns": ["dist/*", "*/dist/*", "package-lock.json", "*.min.js"],
  "excludedCommitShas": [],
  "integrationLabels": ["integration", "bundle"]
}
```

- `repository`: required GitHub `owner/name`. Private repositories are refused
  because the resulting snapshot is intended for a public-facing dashboard.
- `title`: dashboard display title.
- `accounts`: GitHub-login allowlist used by the UI; empty means autodetect.
  The collector does not remove nonmembers' underlying audit records.
- `generatedPatterns`: case-sensitive Python `fnmatch` patterns applied to full
  repository-relative file paths. `*` matches slashes too. Excluded files remain
  in evidence but do not count toward filtered additions/deletions.
- `excludedCommitShas`: exact commit SHAs designated imports/exclusions. Root
  commits are also imports. These records remain visible with `is_root_import`
  and, for explicit exclusions, `excluded_from_credit`.
- `integrationLabels`: case-insensitive exact label names. Matching PRs have
  `is_integration: true`; the UI separates them from implementation credit.
  Titles do not silently override this explicit policy.

Changes to exclusions are reapplied even when raw PR details are cached.

## Outputs and guarantees

`--output public/data.json` is a schema-version-1 snapshot. It contains:

- `repository` (`full_name`, `default_branch`, `html_url`, `created_at`),
  `config` (`title`, `accounts`), `generated_at`, and `coverage`;
- `commits`: unique SHA, author, date, message, parents, identity basis,
  bot/human flags, import/exclusion flags, URL;
- `prs`: number, author, title/body, timestamps/state, files with exclusion
  flags, filtered additions/deletions, integration flag, URL;
- `reviews`: review ID, PR number/author, author/login/user,
  submitted time, state, identity and bot/human flags, URL. Non-approved,
  dismissed, self and bot reviews remain available for audit; the scoring
  layer decides eligibility. API-returned pending records are retained with a
  null submitted timestamp and cannot earn submitted-review credit. Pending
  visibility depends on the token; no claim is made to see other users' drafts.

Only API-linked GitHub identities are treated as human candidates; missing
identities use `Unlinked identity`, never a Git author-name guess. GitHub Bot
accounts and `[bot]` logins are marked nonhuman.

Commit listing is pinned to the initial default-branch head SHA; the branch is
checked again before publication. Every listed commit parent must also be
present, otherwise publication fails. The complete PR metadata list is fetched
again after processing and must match the initial list. Repository visibility
and default-branch name are rechecked too. Complete pagination is performed for commits,
PRs, changed PR file lists, and changed PR review lists. File counts are checked
against PR details; GitHub's 3,000-file cap fails closed rather than claiming
complete coverage. Deduplicated current reachable commits alone appear publicly.

`--cache .atlas-cache/state.json` is **local, unpublished state**. It preserves
all previously observed commits in `commit_history`, even after force pushes,
and raw files/reviews in `pull_requests`. It cannot reconstruct history that
predates the first collection. Do not commit or publish this cache. Separate
cache paths are required for different repositories.

Incremental PR caching fingerprints `updated_at`, head SHA, state and merge
 time. `--full` refetches all file/review lists, including dismissals or edits
that may not advance a PR's timestamp. The coverage notes disclose this
limitation: `reviews_complete` is false whenever any PR review lists were reused;
`reviews_pagination_complete` records successful pagination and
`cached_review_prs` reports reuse. GitHub REST is not a transaction across all objects: concurrent PR
activity can still require a subsequent refresh; this is not an event-log or
point-in-time database export.

A nonblocking, per-cache POSIX file lock rejects concurrent invocations before
cache reads; the kernel releases it on process exit, including crashes. The
small persistent `.lock` file is not deleted, avoiding inode replacement races.
It is created owner-read/write only, without changing existing file permissions.
Use a dedicated cache/output pair; different caches must not target the same
output file.

All API work finishes before snapshot/cache writes. The cumulative cache is atomically
replaced first, then the public snapshot is atomically replaced using a same-
directory temporary file and `os.replace`. Any failed collection leaves the
old snapshot and cache intact. If the final output replacement fails, the old
public snapshot remains valid and the independently fingerprinted cache may be
newer. These are two independent atomic writes, not a two-file transaction.

The collector never deploys, publishes, pushes, or changes GitHub. Review the
resulting public data before choosing to publish it.

Semantically identical cache/snapshot content is not rewritten; `generated_at`
is ignored for this comparison, preserving the timestamp and file bytes. A
change in coverage confidence (fresh versus reused reviews) is substantive and
can cause a replacement even when contribution counts are unchanged.
