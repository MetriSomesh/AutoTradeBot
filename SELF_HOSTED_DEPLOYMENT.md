# TMT Trading Dashboard — Self-Hosted Deployment Guide

> **Financial-risk notice:** This application is operational software, not investment advice or a profit guarantee. Options trading can lose capital quickly. Start in paper mode, validate in Delta demo mode, and enable live capability only after independently reviewing the code, exchange behavior, order permissions, and failure procedures.

## Deployment model

Run the application on a host whose **outbound public IP address is stable**. Delta API keys can be restricted to that address; the web service and the worker must share the same machine or an explicitly allow-listed outbound network path. The web service provides the owner dashboard and authenticated API. The worker is a separate Node process that renews a database lease and polls the adopted pair every five seconds.

| Process | Command | Responsibility |
| --- | --- | --- |
| Web service | `node dist/index.js` | Serves the React dashboard, authenticated tRPC procedures, risk settings, adoption controls, audit records, alerts, and workbook exports. |
| Watchdog worker | `node dist/watchdog-worker.js` | Reads the adopted pair, polls Delta, records snapshots, evaluates safety rules, and processes confirmed reduce-only close requests. |
| MySQL | Managed separately | Stores the owner, pair state, snapshots, close queue, risk settings, ledger, notifications, exports, and worker lease. |
| Reverse proxy | Nginx, Caddy, or equivalent | Terminates HTTPS and forwards dashboard traffic to the local web service. |

## 1. Provision the host

Use a current Linux host with Node.js 22+, MySQL 8+ or compatible MySQL/TiDB, a domain name, and a static public egress IP. Install Node.js, pnpm, Nginx, and a TLS client such as Certbot through your normal operating-system process. The host should not be used for unrelated workloads that might alter the egress IP or exhaust the resources needed by the worker.

Clone or upload the project, then install and build the production artifacts:

```bash
cd /opt/tmt-trading-dashboard
pnpm install --frozen-lockfile
pnpm exec drizzle-kit migrate
pnpm run build
pnpm test
```

The migration command must complete before either process starts. The included migrations create the trade, snapshot, control, ledger, notification, export-job, and worker-lease tables. Back up the database before applying future schema migrations.

## 2. Configure server-only environment values

Create a host-owned permissions-restricted environment file, for example `/etc/tmt-dashboard.env`, owned by the service account and readable only by that account. Do **not** add it to the repository. Do not create browser-exposed variables such as `VITE_DELTA_API_KEY` or `VITE_DELTA_API_SECRET`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | MySQL connection string used by both Node processes. |
| `JWT_SECRET` | Yes | Long random secret used to hash opaque local-session and recovery tokens. |
| `TMT_CREDENTIAL_ENCRYPTION_KEY` | Yes | Independent 32-byte key used for AES-256-GCM encryption of browser-entered Delta API keys and secrets at rest. Generate it with `openssl rand -hex 32`. |
| `TMT_AUTH_ALLOW_REGISTRATION` | Recommended | Set `true` for first-run local sign-up; set `false` after onboarding if you do not want additional local accounts. |
| `TMT_LOCAL_SESSION_DAYS` | Optional | Local-session lifetime in days, from 1 to 30; default is 7. |
| `TMT_WATCHDOG_POLL_SECONDS` | Recommended | Keep at `5`; values below five are clamped to five. |
| `TMT_MAX_TRADE_LOSS_INR` | Live only | Server-side upper loss boundary used by the watchdog. |
| `TMT_NATIVE_BRACKETS_ENABLED` | Recommended live | Enables use of native bracket support for appropriate bot-created pairs. |
| `TMT_LIVE_TRADING_ENABLED` | Live only | Must be literal `true` before a live reduce-only close can be submitted. |
| `TMT_LIVE_TRADING_ACK` | Live only | Must equal `I_ACCEPT_LIVE_ORDER_RISK`. |
| `TMT_LIVE_LOTS`, `TMT_MAX_LIVE_LOTS` | Live only | Positive, compatible lot limits required by the live close gate. |
| `OWNER_WEBHOOK_URL` | Optional | HTTPS webhook fallback for critical owner alerts when the integrated owner-notification channel is unavailable. |

Each user supplies their own demo or live Delta key through **Account & Keys** after local sign-in. The browser sends the values only once over HTTPS; the server encrypts them before persistence and never returns them to the browser. The dashboard also persists a user-controlled `liveArmed` setting. A live reduce-only close requires **both** the environment gates above and the dashboard confirmation phrase `ARM LIVE REDUCE-ONLY CLOSES`.

### Local-account recovery readiness

The database includes single-use, expiry-bound password-reset token storage. Only an HMAC digest of a recovery token is stored, never the reset URL token itself. Before exposing a recovery screen in production, connect an authenticated transactional-email provider or an internal operator-approved delivery service from the server process, set a canonical public application URL, and test expiry, one-time use, and session revocation. Do not place SMTP passwords, reset tokens, or account passwords in browser configuration, source control, or worker logs.

## 3. Whitelist the fixed outbound IP in Delta

Create a dedicated Delta API key with trading permission only and **without withdrawal permission**. Add the server’s fixed public egress IP to the API-key allowlist before saving the key through Account & Keys. Delta’s documentation covers India API routing, API-key permissions, HMAC request authentication, positions, orders, and bracket orders.[1]

> Keep the API secret out of chat messages, screenshots, spreadsheets, browser consoles, source control, and client-side code. If a secret has ever been shared in a chat or committed, revoke it and issue a new key before deploying.

## 4. Run both processes under systemd

Create a non-login service account, such as `tmt`, and grant it access to `/opt/tmt-trading-dashboard` and `/etc/tmt-dashboard.env`. Use the actual paths returned by `command -v node` and `command -v pnpm` on your host.

Create `/etc/systemd/system/tmt-dashboard.service`:

```ini
[Unit]
Description=TMT Trading Dashboard web service
After=network-online.target mysql.service
Wants=network-online.target

[Service]
Type=simple
User=tmt
Group=tmt
WorkingDirectory=/opt/tmt-trading-dashboard
EnvironmentFile=/etc/tmt-dashboard.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/tmt-trading-dashboard/dist/index.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Create `/etc/systemd/system/tmt-watchdog.service`:

```ini
[Unit]
Description=TMT BTC options watchdog worker
After=network-online.target mysql.service tmt-dashboard.service
Wants=network-online.target

[Service]
Type=simple
User=tmt
Group=tmt
WorkingDirectory=/opt/tmt-trading-dashboard
EnvironmentFile=/etc/tmt-dashboard.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/tmt-trading-dashboard/dist/watchdog-worker.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Enable and inspect the services:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tmt-dashboard tmt-watchdog
sudo systemctl status tmt-dashboard tmt-watchdog
sudo journalctl -u tmt-watchdog -f
```

The worker uses a short database lease. If two worker processes are accidentally started, only the lease holder performs a cycle; still, run only one supervised worker intentionally.

## 5. Terminate HTTPS with Nginx

Point your domain’s DNS record to the host, obtain a TLS certificate, and proxy only to the local web service. A minimal Nginx virtual host is:

```nginx
server {
    listen 80;
    server_name tmt.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Add TLS using your organization’s certificate process, then redirect HTTP to HTTPS. Local session cookies use HTTPS and `SameSite=Lax`; do not expose the dashboard over unencrypted HTTP. Limit dashboard access further with a firewall, private VPN, or reverse-proxy allowlist if feasible.

## 6. Activation sequence

Proceed through each stage in order. Do not skip directly to live mode because the dashboard renders successfully.

| Stage | Required setup | Expected result |
| --- | --- | --- |
| Local account | Generate `JWT_SECRET` and `TMT_CREDENTIAL_ENCRYPTION_KEY`, then open `/signup` | The first account becomes the local administrator; later accounts receive separate data and credentials. |
| Demo | Sign in, save a demo-only key through Account & Keys, then adopt a test pair | Manual candidate discovery, adoption, marks, snapshots, partial close queue, and exports can be validated against demo positions. |
| Live readiness | Save a dedicated IP-allow-listed trade-only live key, check native protection, and review risk settings | Dashboard shows only a key fingerprint; the raw credential remains encrypted and live close remains blocked until all gates are armed. |
| Live activation | Set all live server gates, restart both services, type the dashboard arm phrase, confirm one manual adoption | Only then can the worker submit **reduce-only closes** for the adopted pair after a confirmed request or safety rule. |

Before the first live session, verify all of the following in the dashboard: the worker reports **healthy**, the latest poll timestamp advances, the correct CE/PE symbols and remaining lots are shown, the Manual/Auto exit setting is understood, and each 25%/50%/75%/100% close action opens a confirmation dialog. Confirm the Delta account has no unrelated position that could be mistaken for the selected pair.

## Operating rules

Manual mode suppresses bot-side take-profit, overnight profit trailing, and time exits, including the 03:00 IST time exit. It does not suppress the coupled 2× entry stop loss, the configured maximum-loss exit, an already confirmed close request, native bracket execution, or emergency handling. Auto mode enables the configured bot exits and can additionally close the entire **remaining** adopted CE/PE pair once net INR P&L reaches the stored Auto profit target. A target is an exit instruction, not a fill or profit guarantee.

The worker records each 25%/50%/75% partial close in its own audit ledger and records the final remaining-pair closure in the closed-trade ledger. The dashboard does not claim to reconcile unrecorded manual closes that happen outside an adopted pair. Excel downloads are generated from this server-side ledger and snapshot state: `tmt_trade_history.xlsx` contains `TRADES`, `DAILY`, `WEEKLY`, and `MONTHLY`; `tmt_trade_monitor.xlsx` contains `LIVE P&L`.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Worker shows offline | Confirm `tmt-watchdog.service` is running, inspect `journalctl -u tmt-watchdog -f`, then verify the database connection and that the affected local account has an encrypted Delta key. |
| Worker shows degraded | Read the recorded error in Operational Status. Common causes are no current mark, invalid egress IP allowlist, expired API credentials, or an exchange response error. |
| Worker shows emergency | Treat as manual intervention required. Review the pair and Delta account, identify the failed close leg, and do not assume the position is flat. |
| Manual candidates are empty | Confirm the key saved in Account & Keys is the intended demo/live key, has read/trade access, its egress IP is allow-listed, and the account actually has open short BTC options. |
| Live close is blocked | Verify dashboard `liveArmed`, all `TMT_LIVE_*` environment gates, expected lot bounds, and restart the services after an environment update. |
| Owner alert delivery failed | Check the integrated owner-notification configuration or set an HTTPS `OWNER_WEBHOOK_URL`; the database alert log remains available in Operational Status. |

## References

[1]: https://docs.delta.exchange/ "Delta Exchange API documentation"
