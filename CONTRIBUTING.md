# Contributing

Thanks for helping make repository activity easier to understand.

## Start small

Open an issue describing the problem or improvement before a large change. Include expected behavior, actual behavior, and a minimal reproduction. For UI problems, add a redacted screenshot, browser version, and whether you used demo data.

Do not attach private snapshots, access tokens, confidential repository names, or another person’s information without permission. Use fictional examples or the bundled demo.

## Local checks

Use Node.js 18+ and Python 3.10+:

```sh
npm run demo
npm test
npm run build
npm start
```

Check Tracking and Game with demo data. For changes to counting or XP, add regression tests and update [methodology](docs/methodology.md). For configuration changes, update the example configuration and [deployment guide](docs/deployment.md).

## Pull requests

Keep changes focused and explain what changed, why, and how you tested it. Include before/after screenshots for visible changes, with fictional data only. Note any checks you could not run rather than claiming a full pass.

Please preserve:

- No credentials or GitHub API access in frontend code.
- A usable Tracking view independent of Game mode.
- Honest freshness, coverage, and demo labeling.
- Accessible keyboard interactions and readable contrast.
- Transparent scoring without claims about job performance.
- A small dependency footprint and deterministic demo data.

Security-sensitive reports belong in the private reporting process described in [SECURITY.md](SECURITY.md), not public issues.
