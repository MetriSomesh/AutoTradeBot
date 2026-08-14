# TMT MacBook Deployment and Phone Access

## Recommended topology

Run the API and the five-second watchdog **together on the MacBook**. They share the same database and the same home-network public egress IP, so that public IP is the one to allowlist with Delta. Do not run the watchdog on the phone, Vercel, Netlify, or a sleep-prone serverless function.

For phone access, prefer a private HTTPS overlay such as **Tailscale Serve** over opening a router port. It gives the phone authenticated private access without publishing the trading dashboard to the open internet. Keep the API bound to `127.0.0.1` in this setup.

### macOS firewall posture

With `HOST=127.0.0.1` and Tailscale Serve, the Node application accepts only loopback traffic, so do **not** add a macOS firewall rule for TCP port `3000` and do **not** create a router port-forward. If macOS prompts about Tailscale, allow the Tailscale application only as needed for your private tailnet; the dashboard itself remains loopback-only.

For an intentional trusted-LAN deployment, use an HTTPS reverse proxy on port `443` and allow that proxy only from the private LAN in the macOS firewall. Keep raw port `3000` blocked from the LAN and public networks. `HOST=0.0.0.0` is not appropriate on an untrusted Wi-Fi network, and neither approach should use public router port-forwarding.

| Access method | Safety | Use it when |
| --- | --- | --- |
| Tailscale Serve + HTTPS | Recommended | You want to use the dashboard from your phone at home or away without port-forwarding. |
| LAN only with `HOST=0.0.0.0` | Acceptable only behind a trusted Wi-Fi network and HTTPS reverse proxy | You do not need access outside your home. |
| Router port forwarding | Do not use for this dashboard | It exposes sign-in and trading controls to the public internet. |

## 1. Prepare the MacBook

Install Node.js LTS and pnpm, then install a MySQL-compatible database that remains available while the worker runs. Copy the source archive to a non-synced directory such as `~/Applications/tmt-trading-dashboard`, then run:

```bash
cd ~/Applications/tmt-trading-dashboard
pnpm install --frozen-lockfile
pnpm exec drizzle-kit migrate
pnpm run build
pnpm test
```

Create `~/Library/Application Support/TMT/tmt-dashboard.env`, restrict it to your macOS user, and do not sync it through iCloud, Git, Dropbox, or any backup that other people can read:

```bash
mkdir -p "$HOME/Library/Application Support/TMT"
chmod 700 "$HOME/Library/Application Support/TMT"
touch "$HOME/Library/Application Support/TMT/tmt-dashboard.env"
chmod 600 "$HOME/Library/Application Support/TMT/tmt-dashboard.env"
```

At minimum, the file needs `DATABASE_URL`, `JWT_SECRET`, and `TMT_CREDENTIAL_ENCRYPTION_KEY`. Generate the latter with `openssl rand -hex 32`. Use a long random `JWT_SECRET`. Set `HOST=127.0.0.1` when using Tailscale Serve; only use `HOST=0.0.0.0` for a deliberately configured trusted-LAN deployment.

> The MacBook must use a stable public egress IP. Check the public IP from the MacBook’s actual network and add it to the Delta API key allowlist. A home ISP may change the IP after a router reconnect; if it does, Delta requests will fail until the allowlist is updated.

```bash
curl -4 https://api.ipify.org; echo
```

## IST time policy

All strategy time logic is evaluated with the fixed `Asia/Kolkata` time zone, rather than the MacBook’s local time-zone setting. The 03:00 exit is calculated as the **first 03:00 IST after the pair is adopted**. This prevents an evening adoption—for example, 23:57 IST—from being mistaken for “after 03:00” and being closed immediately.

Before enabling Auto mode after an operating-system update or a long period offline, verify that the MacBook clock itself is accurate:

```bash
date -u
TZ=Asia/Kolkata date
```

## Delta read-access recovery

The watchdog remains running when a Delta GET request fails; it marks the pair **degraded**, stores an actionable error in Operational Status, and continues safe read-only polling. It does not submit a retry for any close or order request. If the dashboard reports an IP allowlist failure, update the Delta API key allowlist using the public IPv4 command above, wait for Delta to apply the change, and restart the worker.

## 2. Keep the Mac awake and supervised

The watchdog cannot operate while the MacBook is asleep, shut down, disconnected from the network, or logged out if you use user-level launch agents. Keep it connected to power and configure macOS to prevent automatic sleep while plugged in. A closed laptop lid can also suspend work unless you use supported external-power/display arrangements.

Create two wrapper scripts at `~/Applications/tmt-trading-dashboard/scripts/`. They source the permissions-restricted environment file, then replace the shell with the Node process.

```bash
#!/bin/zsh
# scripts/run-web.zsh
set -a
source "$HOME/Library/Application Support/TMT/tmt-dashboard.env"
set +a
cd "$HOME/Applications/tmt-trading-dashboard"
exec /usr/bin/env pnpm run start
```

```bash
#!/bin/zsh
# scripts/run-worker.zsh
set -a
source "$HOME/Library/Application Support/TMT/tmt-dashboard.env"
set +a
cd "$HOME/Applications/tmt-trading-dashboard"
exec /usr/bin/env pnpm run worker
```

Make them executable with `chmod 700 scripts/run-web.zsh scripts/run-worker.zsh`. Then create `~/Library/LaunchAgents/com.tmt.dashboard.plist` and `~/Library/LaunchAgents/com.tmt.watchdog.plist` using the same pattern below. Replace `<YOUR_MACOS_USERNAME>`.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.tmt.dashboard</string>
  <key>ProgramArguments</key><array><string>/bin/zsh</string><string>/Users/&lt;YOUR_MACOS_USERNAME&gt;/Applications/tmt-trading-dashboard/scripts/run-web.zsh</string></array>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/Users/&lt;YOUR_MACOS_USERNAME&gt;/Library/Logs/tmt-dashboard.log</string>
  <key>StandardErrorPath</key><string>/Users/&lt;YOUR_MACOS_USERNAME&gt;/Library/Logs/tmt-dashboard.error.log</string>
</dict></plist>
```

For `com.tmt.watchdog.plist`, change the label to `com.tmt.watchdog`, the wrapper path to `run-worker.zsh`, and the log file names to `tmt-watchdog.log` and `tmt-watchdog.error.log`. Load both services:

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.tmt.dashboard.plist 2>/dev/null || true
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.tmt.watchdog.plist 2>/dev/null || true
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.tmt.dashboard.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.tmt.watchdog.plist
launchctl print gui/$(id -u)/com.tmt.dashboard
launchctl print gui/$(id -u)/com.tmt.watchdog
```

## 3. Open the dashboard safely on your phone

Install Tailscale on the MacBook and your phone, sign into the same private tailnet, start the web service locally, then configure a private HTTPS reverse proxy to the loopback service:

```bash
tailscale serve --https=443 http://127.0.0.1:3000
tailscale serve status
```

Open the private HTTPS URL reported by `tailscale serve status` on the phone. Keep the worker local; only the web UI is proxied. Do not save Delta secrets in the phone browser. Sign in with the local account, then save your Delta key in **Account & Keys** over the private HTTPS connection.

## Before sleeping after a manually opened trade

Confirm all of the following in the dashboard: the exact CE and PE pair has been adopted; the worker state is **healthy**; the latest poll time advances every five seconds; the MacBook is on power and will not sleep; its public egress IP is still allowlisted at Delta; and Auto mode has a positive INR target if you want a profit-target close. Stop loss and maximum-loss exits remain active even in Manual mode, but no software or network setup guarantees an exchange fill during an outage or rejected order.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Phone cannot open the page | Confirm both devices are connected to the private network and run `tailscale serve status` on the MacBook. |
| Worker is offline | Check `~/Library/Logs/tmt-watchdog.error.log`, `launchctl print gui/$(id -u)/com.tmt.watchdog`, Mac power state, and MySQL connectivity. |
| Worker shows **degraded** with an IP allowlist message | Run `curl -4 https://api.ipify.org; echo`, update the Delta API key allowlist with that IPv4 address, then restart the worker after Delta applies the change. |
| Delta requests fail after internet outage | Recheck the MacBook’s current public IP and update Delta’s allowlist if your ISP changed it. The worker keeps polling read-only requests, but it cannot protect an adopted pair until Delta read access returns. |
| Position closed unexpectedly late at night | Confirm the installed revision contains the first-03:00-after-adoption IST rule, then check the event ledger for the actual recorded close reason. |
| Dashboard works but phone is logged out | Use the private HTTPS URL, not a raw `http://192.168.x.x:3000` address. |
