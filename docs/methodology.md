# Methodology

Contribution Atlas summarizes the GitHub activity available to its collector for a configured repository and set of accounts. A snapshot is evidence of recorded events, not a complete history of someone’s work.

## Two views, one source

**Tracking** presents activity directly. **Game** is an optional, playful interpretation of that activity. Switching views does not change the source data. Demo snapshots use fictional people and events; their points, ranks, and achievements are demonstrations only, not real awards.

## XP rules

| Eligible activity | XP |
| --- | ---: |
| Non-merge, non-import commit | 2 |
| Merged non-integration pull request | 20 |
| Unmerged non-integration pull request | 2 |
| Unique reviewer–pull-request pair | 5 |

Commit SHAs and PR numbers are deduplicated. Merge commits, root/import commits, explicitly excluded commits, and integration PRs do not receive ordinary commit/PR XP. Unmerged includes both open and closed-without-merge PRs.

A merged PR earns 20 XP, not 20 plus the unmerged value. A reviewer can earn review XP only once per PR, even after multiple reviews. Self-reviews and pending reviews are excluded. The review event belongs to the **earliest eligible submitted review date**, not the last review or the PR’s merge date.

These weights are intentionally simple and transparent. They are not empirically validated productivity measures. A small cleanup may create more events than a difficult architectural change; a high score does not establish higher quality or greater impact.

## Fixed ranks

Ranks use fixed thresholds rather than ranking people against one another.

| Total XP from | Game rank |
| ---: | --- |
| 0 | Intern |
| 100 | Technician |
| 500 | Engineer |
| 1,500 | Senior Engineer |
| 3,000 | Lead Engineer |
| 6,000 | Principal Engineer |
| 10,000 | CTO |

**These are fictional game labels, not actual job titles, qualifications, promotions, or employment assessments.** A contributor’s real role and seniority are unrelated to this game.

## Configuration affects interpretation

- `accounts` establishes the displayed GitHub identities. An empty array discovers human accounts. Bots and unlinked identities are excluded from the main view. This display selection does not remove other accounts from the snapshot.
- `generatedPatterns` identifies generated files for filtered change totals.
- `excludedCommitShas` allows known commits to be omitted explicitly.
- `integrationLabels` identifies the PR labels used for integration categorization.

Inspect the configuration alongside a snapshot when comparing results. Different account sets, exclusions, history coverage, and refresh times can produce different totals. Do not compare scores across differently configured dashboards as though they share a common benchmark.

## Dates and coverage

Commit events use the Git author timestamp. Merged PR events use their merge date; unmerged PR events use their creation date. Review XP uses the earliest eligible submission for the reviewer–PR pair. The Game weekly window ends at the snapshot timestamp and begins at midnight UTC six calendar days earlier. Lifetime means the eligible activity in the available snapshot, not all work throughout a person’s career.

The collector covers commits reachable from the current default branch and all PR states. Previously observed commits may remain in a local cache after history changes but are not added to current scores. See [collection coverage and cache behavior](deployment.md#coverage-and-cache).

## Limits and responsible use

GitHub data can be incomplete, missing attribution, changed after collection, or inaccessible to the token. API failures and rate limits can interrupt refreshes. Deleted accounts, rewritten history, bot activity, merge strategies, and repository conventions can affect interpretation.

Line counts are not effort estimates. Commit counts are not quality scores. Reviews do not capture every kind of collaboration. Work in other repositories, pair programming, incident response, mentoring, planning, and offline work may be absent entirely.

Use the dashboard for curiosity, project visibility, and voluntary team fun—not compensation, hiring, performance reviews, or surveillance. Discuss any shared display with the people represented and provide a way to correct attribution or remove unwanted data.
