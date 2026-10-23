# Security and privacy

## Report a vulnerability

Please do not publish exploits, credentials, private snapshots, or sensitive repository details in a public issue or pull request.

If GitHub’s **Report a vulnerability** option is enabled for this repository, use it from the Security tab. Otherwise, ask the maintainers in a public issue for a private reporting channel without including sensitive details. No response-time or support guarantee is implied.

Include a concise description, affected revision, reproduction steps using fictional data where possible, and the potential impact. Do not access data you are not authorized to inspect.

## Credential boundaries

`GITHUB_TOKEN` is a collection-time environment variable. It must never be embedded in configuration, frontend JavaScript, snapshots, screenshots, logs, or static hosting artifacts. Use the narrowest read-only permissions appropriate to the source repository. Collection and deployment are separate privileges.

If a token is exposed, revoke or rotate it promptly and review its access. Removing it from the latest commit does not remove it from repository history, downloaded artifacts, caches, or logs.

## Public snapshots can expose private information

The bundled collector refuses private repositories. Custom importers and manually supplied snapshots must maintain their own privacy boundary. The browser must download the snapshot to display it. A public deployment therefore exposes its snapshot, including any private-source information it contains. A private source repository does not protect copied data on a public host.

Review names, usernames, repository identifiers, activity, links, titles, timestamps, and all other snapshot fields before publication. Use access-controlled hosting when the data is not public. Demo data is the safest choice for screenshots, examples, and public bug reports.

## Trust boundaries

Treat GitHub-derived text and imported snapshots as untrusted input. Render text safely, validate links, and avoid interpreting source data as executable HTML or code. Keep CI secrets away from untrusted pull-request code. Review workflow changes as carefully as application changes.

The optional Game mode is entertainment, not a personnel assessment. Avoid using or distributing activity data in ways that create unwanted monitoring or misleading judgments about individuals.
