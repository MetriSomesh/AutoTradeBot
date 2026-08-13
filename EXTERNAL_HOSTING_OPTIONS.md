# TMT External Hosting Options

## Decision

The proposed **Vercel or Netlify frontend plus Render backend** can host the application only if the Delta-facing backend and the five-second watchdog remain on **separate continuously running Render services** in the same region and both use an outbound-IP configuration that Delta can allowlist. The frontend must never call Delta directly and must not contain a Delta API key or secret.

> A static frontend is only a user interface. The web API and watchdog remain the security and execution boundary.

| Component | Recommended location | Required characteristic |
| --- | --- | --- |
| React frontend | Vercel or Netlify | Static deployment; calls only the TMT API over HTTPS. |
| tRPC/Express API | Render Web Service | Persistent server process, encrypted credential access, HTTPS custom API domain. |
| Five-second watchdog | Render Background Worker | Continuous process; no cron or serverless function; same region as the API. |
| MySQL | Existing managed MySQL or another compatible MySQL provider | Shared durable database for API and worker. Do not substitute Render Postgres without a deliberate database port. |
| Delta egress | Render dedicated outbound IP set attached to the API and worker environment | Whitelist **every** assigned IP with Delta before enabling demo or live management. |

## Why a serverless frontend cannot run the watchdog

Netlify Scheduled Functions are cron-style invocations and have a 30-second execution limit; they are not an uninterrupted five-second process.[3] Vercel Static IPs only solve fixed **egress** for deployed functions and do not turn a frontend deployment into a continuous worker.[4] Consequently, neither Vercel nor Netlify should host `watchdog-worker`.

Render Background Workers run continuously and do not receive incoming traffic, which matches the existing `watchdog-worker` process.[1] Render’s default egress uses shared regional CIDR ranges; a service can use any address in the region’s range.[2] For a Delta API key that requires explicit IP allowlisting, use Render Dedicated IPs instead. A set currently contains three outbound IPv4 addresses, and a service can use any address in its set.[2]

## Recommended Render topology

Deploy the following two services from the same repository and place them in the same Render region and environment.

| Render service | Start command | Notes |
| --- | --- | --- |
| `tmt-api` Web Service | `pnpm run start` | Hosts the Express/tRPC API. Attach `api.example.com`. |
| `tmt-watchdog` Background Worker | `pnpm run worker` | Runs the existing five-second monitoring loop continuously. No public URL is needed. |

Attach one dedicated-IP set to the environment containing both services. Then add **all addresses in that set** to the Delta key allowlist. Do not assume a single address is enough. Before committing to Render, confirm that your Delta account allows the entire address set; if it permits only one address, use the fixed-IP server approach already documented in `SELF_HOSTED_DEPLOYMENT.md` instead.

## Frontend choice

Vercel and Netlify are both suitable for the static React build. Prefer a custom-domain pair such as `app.example.com` for the frontend and `api.example.com` for Render rather than unrelated domains. This keeps the browser interaction same-site, although the API still needs a precise CORS allowlist and credentialed requests.

| Requirement | Required change before a split deployment |
| --- | --- |
| API endpoint | Replace the frontend’s relative `/api/trpc` URL with a build-time `VITE_API_URL` such as `https://api.example.com/api/trpc`. |
| CORS | Configure Express to allow only `https://app.example.com` (or the selected Netlify/Vercel origin), with credentials enabled. Do not use `*` with cookies. |
| Session cookie | Keep HTTPS and `HttpOnly`; use an appropriate `SameSite` configuration for the chosen domain arrangement. Test local sign-in, sign-out, expiry, and renewal from the real frontend origin. |
| Secrets | Store `DATABASE_URL`, `JWT_SECRET`, `TMT_CREDENTIAL_ENCRYPTION_KEY`, and notification secrets only in Render service environment variables. Do not put them in the Vercel/Netlify project. |
| Worker/API consistency | Give both Render services the same database URL and credential-encryption key. The worker lease prevents duplicate executions, but run one intentional worker instance. |

## Practical recommendation

Use this split only if you are willing to run and pay for a non-sleeping Render Web Service, a Render Background Worker, compatible MySQL, and a dedicated Render egress-IP set. It is operationally viable, but it is not simpler than the single fixed-IP server design.

For a single private trading account, the original **one fixed-IP VM with Nginx plus systemd** is the lower-risk deployment because it provides one known outbound IP, one host for API and worker, and no cross-origin session changes. Use Vercel or Netlify only for the frontend if you specifically want CDN-hosted static assets and are prepared to make the API/CORS changes above.

## References

[1]: https://render.com/docs/background-workers "Render Background Workers"
[2]: https://render.com/docs/dedicated-ips "Render Dedicated IPs"
[3]: https://docs.netlify.com/build/functions/scheduled-functions/ "Netlify Scheduled Functions"
[4]: https://vercel.com/docs/networking/static-ips "Vercel Static IPs"
