# Hosting Research Notes

## Render official documentation checked on 2026-08-14

- Render free web services spin down after 15 minutes without inbound HTTP or WebSocket traffic. They are therefore unsuitable for the TMT five-second watchdog.
- Free web services use monthly included instance hours, have an ephemeral filesystem, and do not support persistent disks or shell access.
- Render services use region-specific shared outbound IP ranges. A Delta key that supports multiple allowlisted IPs could allowlist the full published range, but it is not an exclusive IP identity.
- Exclusive static outbound IPs are available through Render dedicated outbound IPs, which require a paid setup. This removes the main fixed-egress uncertainty but does not make the free tier suitable for the continuously running watchdog.

Sources:

- https://render.com/docs/free
- https://render.com/docs/outbound-ip-addresses

## Railway and Fly.io official documentation checked on 2026-08-14

| Provider | Always-on worker and outbound-IP finding | Suitability for Delta API allowlisting |
| --- | --- | --- |
| Railway | Railway documents permanent static outbound IPv4 assignment as a Pro-plan feature. | Suitable only as a paid backend, because the fixed address needed for an allowlisted Delta key is not a free feature. |
| Fly.io | Fly Machines are persistent-capable, but outbound IPs are unstable by default. App-scoped static egress IPv4/IPv6 can be allocated per region, for an additional cost. | Potentially suitable as a paid low-cost backend when configured in one region with static IPv4 egress. |

Sources:

- https://docs.railway.com/networking/static-outbound-ips
- https://fly.io/docs/networking/egress-ips/

## Persistent-worker conclusion

Render background workers are designed to run continuously, but a free Render web service spins down after 15 minutes without inbound traffic and cannot safely substitute for the five-second TMT watchdog. The available Render documentation also places background workers alongside paid service compute, while dedicated outbound IPs require a paid setup. In addition, the current TMT application uses MySQL, so moving the backend off the MacBook requires a separately hosted MySQL-compatible database reachable over TLS; Render's managed database offering is PostgreSQL, not a drop-in MySQL deployment.

Sources:

- https://render.com/docs/background-workers
- https://render.com/pricing
