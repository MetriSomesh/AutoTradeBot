# Remote Backend with a MacBook-Hosted Frontend

## Recommendation

For the current application, there is **no reliable free hosted-backend option** for unattended Delta monitoring. The backend is not merely an API: it contains the five-second watchdog, encrypted Delta credentials, and the only process that can submit a confirmed reduce-only close. It therefore needs continuous execution, durable MySQL access, and a stable egress identity that Delta can allowlist.

The safest zero-cost topology remains the existing one: keep the API, watchdog, MySQL, and frontend on the MacBook, with phone access through Tailscale. It has one known outbound public IP, avoids cross-origin browser sessions, and uses the existing integrated deployment.

> A free web endpoint is suitable for a demonstration UI, not for a watchdog that must continue polling an adopted trade every five seconds.

## Option comparison

| Topology | Cost position | Watchdog and Delta suitability | Recommendation |
| --- | --- | --- | --- |
| MacBook: frontend + API + worker + MySQL | No extra hosting cost | Continuous while the MacBook is powered and awake; Delta sees the MacBook public IPv4. | **Recommended for current private use.** |
| MacBook frontend + Render free API | Free, but incomplete | A Render free web service spins down after 15 minutes without inbound traffic. It cannot run the five-second worker continuously. | Do not use for an active trade watchdog. |
| MacBook frontend + paid Render API/worker + remote MySQL + dedicated egress | Multi-service paid setup | Operationally workable, provided both API and worker use a dedicated egress set allowlisted at Delta. | Use only if you want the worker independent of the MacBook. |
| MacBook frontend + Fly Machine + remote MySQL + static egress IPv4 | Low-cost paid setup | A persistent Machine plus static egress can support allowlisting, but the default Fly egress IP is not stable and MySQL must also be remote. | Reasonable technical alternative for experienced operators. |
| MacBook frontend + Railway service | Paid for fixed egress | Railway static outbound IPv4 is documented as a Pro-plan feature. | Not a free solution for Delta allowlisting. |
| MacBook frontend + one AWS EC2 VM | Time-limited Free Tier or credits for eligible new accounts; paid afterward | A single Ubuntu VM can run API, worker, and MySQL with one Elastic IP address for Delta allowlisting. | **Best cloud option if you accept AWS account administration and a future bill.** |

## AWS Free Tier VPS assessment

AWS EC2 is technically the closest cloud replacement for the MacBook deployment. A single EC2 Ubuntu instance can run the API service, the five-second worker, and MySQL under `systemd`; an Elastic IP gives Delta one stable IPv4 address to allowlist. This is materially simpler than splitting API, worker, database, and egress across multiple hosted products.

It is not an indefinite free VPS. AWS documents that accounts created on or after 15 July 2025 use a six-month Free Tier or available credits, whichever ends first. Eligible RDS MySQL instances are also credit-backed on the current Free Tier, so RDS is optional rather than necessary for a small private deployment. Public IPv4 addresses and Elastic IPs are billable outside available Free Tier coverage or credits. [6] [7] [8]

For this application, use **one EC2 VM and one Elastic IP** rather than a public RDS database. Keep MySQL bound to `127.0.0.1`, allow inbound HTTPS only through Caddy or Nginx, and restrict SSH to Tailscale or the administrator's current IP. Do not expose port 3306 to the internet. The VM's Elastic IP is the address to add to the relevant Delta demo or live API-key allowlist.

The frontend can remain on the MacBook, but this requires one of two approaches: a MacBook reverse proxy that forwards `/api/*` to the EC2 HTTPS API, preserving the existing same-origin browser session; or an application change to configure a remote `VITE_API_URL` and exact credentialed CORS. The reverse-proxy approach is less invasive, but the MacBook must remain online for the frontend to be reachable from the phone.

Before creating an AWS account, configure AWS Budgets and billing alerts with a small threshold, and verify the exact Free Tier terms shown in that account's console. Do not move an active live monitored pair during the migration; validate the remote environment in demo mode first.

## Why the direct split is not currently plug-and-play

The current frontend sends tRPC requests to the relative URL `/api/trpc`, which works because the Express API serves the Vite build from the same origin. Moving only the API to a cloud provider and serving frontend files from the MacBook would require either a same-origin reverse proxy on the MacBook or a deliberate cross-origin deployment.

The practical split is a **MacBook reverse proxy**. It serves the static frontend through a Tailscale HTTPS hostname and forwards `/api/*` to the cloud API. The browser still sees one origin, so the existing session cookie and relative tRPC URL continue to work. The remote API and worker still need the same remote MySQL database URL, encryption key, JWT secret, and server-only Delta credentials.

## Requirements before a remote-backend implementation

| Area | Required work |
| --- | --- |
| API service | Deploy a persistent Node web service running `pnpm run start`. |
| Watchdog service | Deploy one separate persistent service running `pnpm run worker`; do not use cron, serverless functions, or a free service that sleeps. |
| Database | Move MySQL to a managed MySQL-compatible host with TLS; do not expose the MacBook MySQL port publicly. |
| Delta allowlisting | Assign a stable outbound IPv4 to the API/worker environment and add every required address to the correct demo or live Delta API key allowlist. |
| Browser session | Either reverse proxy `/api` from the MacBook frontend host, or implement a precise HTTPS CORS and cookie policy for the chosen two-domain setup. |
| Secrets | Store `DATABASE_URL`, `JWT_SECRET`, `TMT_CREDENTIAL_ENCRYPTION_KEY`, and Delta credentials only in the remote backend environment. Never place them in the MacBook frontend build. |

## Recommended next decision

Use the MacBook-only deployment until you decide that the watchdog must remain available when the MacBook is off or away from its network. At that point, choose a single fixed-IP VM or a paid Render/Fly topology, then implement the API split and remote MySQL migration together. Do not move only one component at a time for a live monitored pair.

## References

[1]: https://render.com/docs/free "Render free instances"
[2]: https://render.com/docs/background-workers "Render background workers"
[3]: https://render.com/docs/outbound-ip-addresses "Render outbound IP addresses"
[4]: https://docs.railway.com/networking/static-outbound-ips "Railway static outbound IPs"
[5]: https://fly.io/docs/networking/egress-ips/ "Fly.io egress IP addresses"
[6]: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html "Amazon EC2 Free Tier usage"
[7]: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/elastic-ip-addresses-eip.html "Elastic IP addresses"
[8]: https://aws.amazon.com/rds/free/ "AWS Free Tier with Amazon Aurora and RDS"
