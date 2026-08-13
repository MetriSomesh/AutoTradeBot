# GitHub Release Handoff

## Release inventory

The repository is ready to contain the application source and deployment documentation needed to build the TMT dashboard on a MacBook. Commit the `client/`, `server/`, `drizzle/`, and `shared/` source directories, all root configuration files including `package.json` and `pnpm-lock.yaml`, and the operational documents in the project root.

| Commit to GitHub | Keep only on the MacBook or other trusted runtime |
| --- | --- |
| Application code, Drizzle schema and migrations, tests, package lockfile, `README`-style operational documents, and `.gitignore` | Database connection string, session secret, credential-encryption key, notification-webhook secret, Delta API credentials, generated build output, dependencies, runtime logs, local databases, and backup archives. |

The release audit found no tracked build directory, dependency tree, runtime-log directory, archive, local database file, or high-confidence literal API-token pattern. The only environment-named tracked source file is `server/_core/env.ts`; it contains configuration access code, not a runtime credential file.

## Push from this repository

Create an empty private repository on GitHub, then use GitHub’s repository URL in the following commands:

```bash
git status
git add .
git commit -m "Release TMT trading dashboard"
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/tmt-trading-dashboard.git
git push -u origin main
```

Run `git status` once more before the push. If it shows a local runtime secret file, generated output, or an archive, stop and remove it from the staged set before continuing. Never use a real Delta API key in a commit, issue, pull request, screenshot, or repository secret-scanning exception.

## Pull on the MacBook

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/tmt-trading-dashboard.git ~/Applications/tmt-trading-dashboard
cd ~/Applications/tmt-trading-dashboard
pnpm install --frozen-lockfile
pnpm exec drizzle-kit migrate
pnpm run build
pnpm test
```

Then follow `MACBOOK_DEPLOYMENT.md` to create the permissions-restricted runtime-secret file, configure `launchd`, set up private phone access, and validate in Delta demo mode before live arming.
