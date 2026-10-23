# Configuration and deployment

## Requirements

- Node.js 18 or newer for build scripts and JavaScript tests.
- Python 3.10 or newer for the collector, demo generator, tests, and local static server.
- Linux, macOS, or WSL for the collector’s POSIX concurrency lock. The static dashboard works in modern browsers on other platforms.
- Network access to GitHub for real collection; no token is needed for the demo.

## Configuration

Edit `atlas.config.json` before collecting data:

| Key | Purpose |
| --- | --- |
| `repository` | GitHub repository in `owner/name` format. |
| `title` | Human-readable dashboard title. |
| `accounts` | Array of GitHub login strings to display. Empty means discovered human accounts. This does not redact other accounts from the downloaded snapshot. |
| `generatedPatterns` | File patterns identifying generated content for filtering. |
| `excludedCommitShas` | Explicit commit SHAs to leave out. |
| `integrationLabels` | Pull-request labels identifying integration work. |

Use the checked-in file as the schema example. Keep it free of tokens, passwords, private personal information, and confidential repository details if it will be committed publicly.

## Collect a snapshot

The bundled collector accepts **public repositories only** and refuses private repositories, even if the token can read them. Optionally set `GITHUB_TOKEN` using your environment or secret manager, with only the read access needed. Unauthenticated public API limits are low. Then run:

```sh
python3 scripts/refresh.py
npm run build
```

Do not put credentials in a command you intend to paste into an issue, terminal screenshot, or shared log. Never put credentials in `atlas.config.json`, `public/`, or `dist/`. The browser consumes a JSON snapshot, not the GitHub API token.

Review the generated `public/data.json`. Confirm the source repository, identities, date coverage, exclusions, and any warnings before deploying. A successful build establishes that assets were produced, not that collection was complete or publication was authorized.

### Coverage and cache

Commits are unique SHAs reachable from the pinned default-branch head; other branches are not a separate source of commit credit. Collection fails if that head, the default branch, repository visibility, or observed PR metadata changes during the run. All PR states are collected. Generated-file matching uses case-sensitive Python `fnmatch` patterns against complete file paths. Integration labels are matched case-insensitively.

The collector keeps a local cache at `.atlas-cache/state.json`, including previously observed commit history and PR file/review records. That archive is not an additional source of scored commits. Unchanged PR records may reuse cached file and review lists. The snapshot reports cached review PRs and does not claim fully refreshed reviews when these lists are reused. Run a full reconciliation to refetch them after review edits or dismissals:

```sh
python3 scripts/refresh.py --full
```

Use `--config`, `--output`, and `--cache` to choose other paths; output and cache must differ. Keep the cache out of public hosting. Collection errors preserve the existing public snapshot rather than replacing it with an incomplete result. GitHub REST is not transactional, so concurrent PR changes may still require another refresh. PR file lists beyond GitHub’s 3,000-file limit cause a collection failure rather than silent truncation.

A per-cache lock prevents overlapping refreshes using the same cache. An unchanged result preserves the existing snapshot and its timestamp; the CLI reports `Unchanged`. Check collection logs for the latest successful attempt rather than interpreting an old timestamp alone as a failed refresh.

For an offline preview with fictional data:

```sh
npm run demo
npm run build
npm start
```

`npm start` serves `public/` at http://localhost:3000. To verify the built output instead, run `python3 -m http.server 3000 --directory dist`.

The demo generator replaces `public/data.json` with deterministic sample data. Do not accidentally deploy it as a real activity report.

## Static hosting

Deploy the contents of `dist/` to a static web host. No Python process or GitHub token is needed at runtime. Serve the site over HTTPS, verify asset paths at the actual deployment URL, and test both Tracking and Game after publication.

The snapshot and all static assets are visible to anyone who can access the site. Hiding a panel, omitting a link, or using an unguessable URL is not access control. The bundled collector refuses private repositories. If you supply a custom snapshot containing private data, use suitable authentication and authorization—or publish only an explicitly reviewed public subset.

## Refresh with GitHub Actions

### Included workflows

- **Validate** (`ci.yml`) runs tests and builds the fictional demo on pushes and pull requests. It does not collect real data or deploy.
- **Collect public snapshot** (`snapshot.yml`) runs manually, uses GitHub’s short-lived job token with `contents: read`, and collects only the configured public repository with `--full`. No personal token secret is needed for the included workflow.

To run collection, commit your reviewed configuration, open the repository’s **Actions** tab, select **Collect public snapshot**, and choose **Run workflow**. After a successful run, open its summary and download **contribution-snapshot** under **Artifacts**. The artifact contains `data.json` and is retained for seven days. Review it before copying it into `public/data.json`, building, and deploying. The workflow does not commit the snapshot, deploy a site, or enable recurring collection.

### Optional automation

An adapted manual or scheduled workflow can collect, test, build, and deploy. Keep the stages distinct:

1. Check out the intended revision and install the required Node.js and Python versions.
2. Provide the collector a repository secret containing a narrowly scoped, read-only token when the workflow’s token cannot read the source.
3. Run `python3 scripts/refresh.py` and fail the workflow on collection errors.
4. Run `npm test` and `npm run build`.
5. Publish `dist/` using your host’s supported deployment mechanism.
6. Check the deployed snapshot timestamp and both dashboard modes.

Use `workflow_dispatch` for manual refreshes and `schedule` when recurring refreshes are appropriate. This is periodic collection, **not live streaming**. Scheduled runs may be delayed or skipped; collection and deployment can fail independently. Monitor workflow failures and logs; unchanged results retain the previous snapshot timestamp.

Do not give pull-request workflows from untrusted contributors access to collection or deployment secrets. Keep collection permissions separate from deployment permissions wherever possible. Review generated artifacts before making a private source’s data public.

## Before publishing

- [ ] The target repository and accounts are correct and approved for display.
- [ ] The snapshot contains only information authorized for the intended audience.
- [ ] No credentials appear in source, JSON, static output, or logs.
- [ ] The displayed timestamp and demo/real-data status are accurate.
- [ ] Tests and build pass for the revision being deployed.
- [ ] Both modes work at the host’s actual base path.
- [ ] A failed refresh will not be mistaken for current data.
