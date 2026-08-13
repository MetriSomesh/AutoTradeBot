# Delta Exchange Integration Contract

The backend uses Delta Exchange India only through server-side HTTPS requests. It targets `https://api.india.delta.exchange`, resolves exchange product IDs before account actions, and never exposes a signing secret to the browser. Delta’s official documentation lists the India API base URL and documents REST authentication, products, orders, positions, and bracket orders.[1]

| Operation | API route | Application rule |
| --- | --- | --- |
| Product lookup | `GET /v2/products` | Resolve active `product_id` values from the exchange rather than accepting an arbitrary identifier from the browser. |
| Manual adoption candidates | `GET /v2/positions?underlying_asset_symbol=BTC` | Show only open short `C-BTC-*` and `P-BTC-*` positions. |
| Per-leg verification | `GET /v2/positions?product_id=<id>` | Verify that the requested leg remains short and that both selected legs have equal absolute size. |
| Live monitoring | `GET /v2/tickers` and authenticated positions | Treat a missing CE, PE, or BTCUSD mark as a degraded condition; do not manufacture a price or submit an exit from an incomplete snapshot. |
| Close action | `POST /v2/orders` | Submit a reduce-only market buy for the exchange-reported short size only after a confirmed dashboard request or a safety rule. |
| Native bracket | `POST /v2/orders/bracket` | Preserve native OCO protection where enabled and reconcile the remaining leg when an external or bracket action makes either leg flat. |

> **Safety invariant:** Manual Hold only suppresses bot-side take-profit, profit-trailing, and time exits. It does not suppress coupled 2× stop loss, the configured maximum-loss exit, a confirmed owner close request, or emergency handling after a failed close.

Authenticated requests sign the compact JSON body using HMAC-SHA256 over `METHOD + TIMESTAMP + PATH + QUERY + BODY`. The application uses a seconds timestamp and bounded 15-second request timeout, matching the validated client contract supplied with this project.

## References

[1]: https://docs.delta.exchange/ "Delta Exchange API documentation"
