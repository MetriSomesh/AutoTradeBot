# TMT Trading Dashboard — Self-Hosted Architecture

## Design read

Reading this as: a self-hosted financial operations dashboard with isolated local user workspaces for BTC-options accounts, with a **dark technical-control-room** language, high data density, restrained motion, and safety-first interaction design.

## Runtime contract

The project is split into two deployable Node processes. The `web` process serves the authenticated React dashboard and tRPC backend. The `worker` process runs the five-second Delta monitoring loop. The worker is deliberately not started inside the web server, so the project can run on a self-hosted machine with a supervisor such as systemd, Docker Compose, PM2, or an equivalent process manager.

The self-hosted environment must provide HTTPS, MySQL, a stable outbound IP that is whitelisted by Delta, server-side environment variables, and automatic restart for both processes. The application does not start a worker automatically in the managed preview environment.

## Security model

| Boundary | Control |
| --- | --- |
| Browser | Receives dashboard and trade data only; never receives Delta secrets or a signing capability. |
| API | Every trade, adoption, settings, export, and close procedure requires a local signed-in session and is scoped to that account’s records. |
| Delta client | Runs only in the backend/worker. Each account’s API key and secret are AES-256-GCM encrypted at rest, decrypted only for a server-side signed request, and never returned to the browser. |
| Close action | Requires an explicit browser confirmation, creates a durable 25%/50%/75%/100% queue record, and is executed by the worker as a paired reduce-only close. |
| Worker | Acquires a database lease before polling to prevent duplicate monitors or duplicate closes. |
| Audit | Every adoption, control change, watchdog decision, API error, and close attempt is persisted. |

## Worker lifecycle

Every five seconds, the worker renews its lease, iterates active account-scoped adopted pairs, obtains marks using the matching encrypted credential, stores a snapshot, and evaluates rules in this order: emergency stop, a queued close request, coupled stop loss, maximum loss, native-bracket reconciliation, Auto-mode net-profit target, both-legs take profit, overnight profit trailing, and the 03:00 IST time exit. Manual mode suppresses only take-profit, profit-trailing, and time exits; it never suppresses stop loss, maximum loss, emergency conditions, or a confirmed close request.

## Data model

The MySQL database stores account-scoped local users, opaque sessions, recovery-token hashes, encrypted Delta credentials, adopted trade pairs, current and historical leg snapshots, percentage close requests, partial-close ledgers, risk settings, worker leases, notification events, audit events, and closed-trade ledger rows. Excel files are generated on demand from these records for download; the database is the durable source of truth.

## Notifications and exports

The application records all critical notifications in the database and, when an `OWNER_WEBHOOK_URL` server-side secret is set, sends an owner webhook for stop loss, automatic close, close failure, and emergency-stop events. Trade-history and live-monitor workbooks are generated server-side for download without storing API keys or raw credentials in reports.
