# Stale Closed Pair Recovery

Use this procedure only when the CE and PE positions are **already confirmed closed in Delta** but the local dashboard still shows the pair as `adopted`, `closing`, or `emergency`. It clears the local runtime blockage so a fresh pair can be adopted. It does **not** submit an order to Delta.

> Stop both the dashboard and watchdog before changing the local database. Do not use this procedure when either option leg remains open at Delta; investigate the Delta position and worker error first.

## What this preserves

The procedure does not delete `users`, `delta_credentials`, `closed_trades`, `partial_closes`, `trade_snapshots`, or `trade_events`. It cancels only pending stale close requests, marks the selected stale pair closed, and resets that account's watchdog runtime row.

## 1. Stop the two local processes

Press `Ctrl+C` once in the Terminal running `pnpm run start` and once in the Terminal running `pnpm run worker`.

## 2. Inspect the stale active pair

Open MySQL with the same database account used in `DATABASE_URL`:

```bash
mysql -u tmt_app -p -h 127.0.0.1 tmt_dashboard
```

Then run:

```sql
SELECT id, owner_id, status, ce_symbol, pe_symbol, remaining_lots, created_at, close_reason
FROM trade_pairs
WHERE status IN ('adopted', 'closing', 'emergency')
ORDER BY created_at DESC;
```

Record the `id` of the **one stale pair that is already closed at Delta**. In the transaction below, replace `123` with that exact ID.

## 3. Reset only that stale pair

```sql
SET @pair_id = 123;

START TRANSACTION;

SELECT @owner_id := owner_id
FROM trade_pairs
WHERE id = @pair_id
  AND status IN ('adopted', 'closing', 'emergency')
FOR UPDATE;

UPDATE close_requests
SET status = 'cancelled',
    error = 'Cancelled by local stale-pair recovery after Delta positions were confirmed closed.',
    processed_at = NOW()
WHERE pair_id = @pair_id
  AND status IN ('pending', 'processing');

UPDATE trade_pairs
SET status = 'closed',
    remaining_lots = 0,
    manual_hold = FALSE,
    profit_high_inr = NULL,
    close_reason = 'Local stale-pair recovery: positions confirmed closed at Delta.',
    closed_at = COALESCE(closed_at, NOW())
WHERE id = @pair_id
  AND owner_id = @owner_id
  AND status IN ('adopted', 'closing', 'emergency');

UPDATE watchdog_states
SET pair_id = NULL,
    status = 'offline',
    manual_hold = FALSE,
    close_requested = FALSE,
    profit_high_inr = NULL,
    last_snapshot_at = NULL,
    last_poll_at = NULL,
    last_error = NULL,
    worker_id = NULL
WHERE owner_id = @owner_id;

COMMIT;
```

Verify there is no remaining active pair:

```sql
SELECT id, status, close_reason
FROM trade_pairs
WHERE status IN ('adopted', 'closing', 'emergency');

SELECT owner_id, pair_id, status, last_error
FROM watchdog_states;
```

The first query should return no stale active pair for the recovered account. Exit MySQL with `exit`.

## 4. Restart and verify

Start `pnpm run start` and `pnpm run worker` again after sourcing the usual environment file. Sign in to the dashboard. With a configured Delta key but no adopted pair, **Operational Status** should show the workspace as **idle**. You can then adopt a fresh, currently open matched CE/PE pair.

If the worker immediately becomes degraded, do not repeat this database reset. Read the exact Operational Status error first. For an IP allowlist message, run `curl -4 https://api.ipify.org; echo`, update that IPv4 address in Delta, wait for it to apply, then restart the worker.
