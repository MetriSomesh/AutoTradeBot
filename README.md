# TMT Trading Dashboard

**TMT Trading Dashboard** is a self-hosted control room for monitoring and managing matched BTC and Gold Token (XAUT) short option pairs on Delta Exchange India. It separates the authenticated dashboard from a persistent five-second watchdog, keeps Delta credentials server-side, and provides auditable controls for manual adoption, risk exits, partial reduces, exports, and demo-only scheduled entries.

> **Risk notice.** This is operational software, not investment advice or a profit guarantee. Options trading can lose capital rapidly. Start in paper mode, validate in Delta demo mode, and independently review exchange behavior and all risk settings before enabling any live capability.

## Screenshots

The repository includes only **credential-free** screenshots. Authenticated trading views are deliberately not published with account, order, position, or P&L data.

| Local sign-in | First-time local account setup |
| --- | --- |
| ![TMT local sign-in screen](docs/screenshots/sign-in.png) | ![TMT local account creation screen](docs/screenshots/create-account.png) |

For a Live Monitor, Risk Settings, Scheduled Demo Entry Audit, or P&L Analytics screenshot, capture it locally and redact usernames, public IPs, key fingerprints, account IDs, order IDs, balances, symbols if sensitive, and trade/P&L data before committing. See [README screenshot notes](docs/README_SCREENSHOT_NOTES.md).

## What it provides

| Area | Capability |
| --- | --- |
| Local access | First-user administrator bootstrap, username/password sign-in, opaque HTTP-only sessions, lockout controls, and account-scoped data. |
| Credential security | Per-account Delta API credentials encrypted at rest with AES-256-GCM; raw keys and secrets never return to the browser. |
| Pair management | Explicit manual CE/PE adoption with equal-lot and same-underlying validation for BTC and XAUT option pairs. |
| Persistent protection | A separately supervised worker checks scheduled-entry triggers and active adopted pairs every five seconds under a database lease. |
| Exit controls | Coupled stop-loss, maximum-loss protection, take-profit, profit trailing, Manual/Auto exit modes, and an INR Auto profit target. |
| Manual intervention | Confirmed 25%, 50%, 75%, and 100% paired reduce-only closes with durable audit records. |
| Scheduled demo entries | Owner-managed multiple IST trigger times, weekday selection, per-trigger lots and premium bands, one-attempt-per-IST-date protection, fill reconciliation, and visible outcomes. |
| Operations | Live Monitor, Risk Settings, Scheduled Entries, Operational Status, P&L Analytics, audit events, owner alert support, and Excel-compatible exports. |

## Architecture

The application intentionally runs as **two Node.js processes** connected to the same MySQL database.

| Process | Command | Responsibility |
| --- | --- | --- |
| Web service | `pnpm run start` | Serves the React dashboard, local authentication, tRPC API, settings, audit views, and exports. |
| Watchdog worker | `pnpm run worker` | Acquires the worker lease, evaluates enabled scheduled-entry triggers, monitors adopted pairs, records snapshots, and processes safety exits or confirmed close requests. |
| MySQL | Managed separately | Stores users, encrypted credentials, pairs, snapshots, risk settings, trigger attempts, close queues, audit history, and exports. |

Only **one** watchdog should be intentionally supervised. Its database lease prevents duplicate cycles if another process is accidentally started. An **idle** dashboard with no adopted pair does not disable scheduled-entry scanning: each worker cycle evaluates enabled triggers before it inspects active pairs.

## Technology

- React 19, TypeScript, Tailwind CSS 4, and Vite
- Express 4 and tRPC 11
- Drizzle ORM and MySQL 8-compatible storage
- Node.js 22+ and pnpm
- Vitest regression suite

## Quick start on a MacBook

### Prerequisites

Install Node.js 22+, pnpm, and MySQL 8+ (or a compatible MySQL/TiDB service). Delta authenticated API requests must come from an IP allowlisted on the Delta API key. Keep the MacBook awake and connected while the worker is responsible for monitoring or scheduled demo entries.

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/tmt-trading-dashboard.git ~/Applications/tmt-trading-dashboard
cd ~/Applications/tmt-trading-dashboard
pnpm install --frozen-lockfile
```

Create the database and a least-privilege database user, then create a local `.env` file that is **never committed**. Generate the two independent 32-byte secrets with `openssl rand -hex 32`.

```bash
DATABASE_URL='mysql://tmt_app:CHANGE_THIS_PASSWORD@127.0.0.1:3306/tmt_dashboard'
JWT_SECRET='PASTE_A_64_CHARACTER_HEX_VALUE'
TMT_CREDENTIAL_ENCRYPTION_KEY='PASTE_A_DIFFERENT_64_CHARACTER_HEX_VALUE'
TMT_AUTH_ALLOW_REGISTRATION=true
TMT_MODE=paper
TMT_LIVE_TRADING_ENABLED=false
HOST=127.0.0.1
PORT=3000
```

Apply the schema, build, and test before starting either process.

```bash
pnpm exec drizzle-kit migrate
pnpm run build
pnpm test
```

Start the two processes in separate terminals:

```bash
# Terminal 1 — dashboard and API
pnpm run start

# Terminal 2 — persistent watchdog
pnpm run worker
```

Open `http://127.0.0.1:3000`, create the first local account, and then add a Delta **demo** credential through **Account & Keys**. For launchd supervision, private phone access through Tailscale, and sleep-prevention guidance, follow [MACBOOK_DEPLOYMENT.md](MACBOOK_DEPLOYMENT.md).

## Demo scheduled entries

Scheduled entry is disabled by default and deliberately restricted to a Delta **demo** credential. It is not a live-order facility.

Before enabling a trigger in **Scheduled Entries**, set these server-side values and restart the watchdog:

```bash
TMT_MODE=demo
TMT_LIVE_TRADING_ENABLED=false
TMT_DEMO_SCHEDULED_ENTRY_ENABLED=true
TMT_DEMO_SCHEDULED_ENTRY_ACK=I_ACCEPT_DEMO_SCHEDULED_ENTRY_RISK
```

Create a trigger in the dashboard, choose its IST time, weekdays, lot size, and premium band, then enable it after confirmation. Each enabled trigger is eligible for a five-minute window beginning at its configured IST minute; a `19:53` trigger, for example, is eligible from `19:53` through `19:57` IST. Per-trigger-per-IST-date idempotency prevents duplicate attempts.

The **Operational Status → Scheduled Demo Entry Audit** records each processed window as one of the following:

| Audit result | Meaning |
| --- | --- |
| `opened` | Both IOC legs reconciled at equal requested lots and the pair was adopted. |
| `flattened` | A zero, partial, or unequal fill was detected; the worker attempted to flatten detected short legs. |
| `skipped` | A pair was already active or that trigger had already attempted its IST date. |
| `failed` | A required demo gate, credential mode, candidate selection, API request, or reconciliation check prevented entry. |

**Operational Status** includes a worker-runtime report and a demo-gates check. These show the active watchdog's loaded mode and boolean gate state only; no API key, API secret, acknowledgement phrase, database URL, or encryption key is exposed.

## Security boundaries

- Do not commit `.env` files, database URLs, session secrets, encryption keys, Delta keys, Delta secrets, logs, exports with sensitive data, or archives.
- Use a dedicated Delta key with **trading permission only** and **no withdrawal permission**.
- Store the environment file outside the repository with restrictive permissions when using launchd.
- Use Tailscale or another private HTTPS path for phone access; do not expose a raw local HTTP dashboard to the public internet.
- Rotate and revoke any credential that has been shared in a chat, screenshot, spreadsheet, commit, issue, or pull request.

## Operating model

Manual Hold suppresses bot-side take-profit, profit-trailing, and time exits only. It does not suppress stop loss, maximum loss, emergency handling, native exchange protections, or an already-confirmed close request. Auto mode enables normal bot exits and can close the remaining pair at the configured INR net-profit target.

Every trade action should be reviewed in the dashboard audit history. Network, exchange, IP-allowlist, liquidity, API, database, or host failures can prevent timely reads or fills; no software configuration guarantees an exchange outcome.

## Development commands

| Command | Purpose |
| --- | --- |
| `pnpm run dev` | Start the development web server. |
| `pnpm run worker:dev` | Run the watchdog from TypeScript source during development. |
| `pnpm run build` | Build the browser bundle, web server, and watchdog worker. |
| `pnpm run start` | Start the built production web service. |
| `pnpm run worker` | Start the built persistent watchdog worker. |
| `pnpm test` | Run the Vitest regression suite. |
| `pnpm exec drizzle-kit migrate` | Apply pending database migrations. |

## Documentation

| Document | Use it for |
| --- | --- |
| [MACBOOK_DEPLOYMENT.md](MACBOOK_DEPLOYMENT.md) | macOS installation, launchd services, Tailscale phone access, logs, scheduled demo-entry gates, and troubleshooting. |
| [SELF_HOSTED_DEPLOYMENT.md](SELF_HOSTED_DEPLOYMENT.md) | General production deployment model, server-side environment contract, and security boundaries. |
| [DELTA_INTEGRATION.md](DELTA_INTEGRATION.md) | Delta API integration notes and exchange-facing behavior. |
| [STALE_PAIR_RECOVERY.md](STALE_PAIR_RECOVERY.md) | Non-destructive recovery of an already-flat stale adopted pair. |
| [GITHUB_HANDOFF.md](GITHUB_HANDOFF.md) | Safe commit, push, pull, and repository audit checklist. |
| [REMOTE_BACKEND_MAC_FRONTEND.md](REMOTE_BACKEND_MAC_FRONTEND.md) | Assessment of a remote backend with a MacBook-hosted frontend. |

## Contributing and GitHub hygiene

Before opening a pull request, run:

```bash
pnpm test
pnpm run build
git status
```

Review every staged file for secrets and runtime artifacts. GitHub repositories should contain source, migrations, tests, documentation, and safe screenshots only.

---

This repository is provided for self-hosted operational use. **It is not investment advice, does not predict returns, and does not guarantee order execution or protection against loss.**
