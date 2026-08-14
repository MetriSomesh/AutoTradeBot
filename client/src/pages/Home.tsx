import { PnlChart } from "@/components/trading/PnlChart";
import { TradeLegCard } from "@/components/trading/TradeLegCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { formatIstTime } from "@/lib/istTime";
import { getWatchdogBadgePresentation } from "@/lib/watchdogDisplay";
import { Activity, AlertTriangle, CircleOff, RefreshCw, ShieldCheck, XOctagon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const usd = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inr = (value: number) => `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function MonitorSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between"><div className="space-y-2"><Skeleton className="h-7 w-64" /><Skeleton className="h-4 w-96" /></div><Skeleton className="h-9 w-24" /></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-44 rounded-2xl bg-[#1a1a1e]" />)}</div>
      <Skeleton className="h-72 rounded-2xl bg-[#1a1a1e]" />
    </div>
  );
}

export default function Home() {
  const utils = trpc.useUtils();
  const [closePercent, setClosePercent] = useState<25 | 50 | 75 | 100 | null>(null);
  const status = trpc.trading.watchdog.status.useQuery(undefined, { refetchInterval: 5_000 });
  const runtime = trpc.trading.delta.runtime.useQuery(undefined, { refetchInterval: 30_000 });
  const historyInput = useMemo(() => ({ pairId: status.data?.pair?.id ?? 0, hours: 6 }), [status.data?.pair?.id]);
  const history = trpc.trading.watchdog.history.useQuery(historyInput, { enabled: historyInput.pairId > 0, refetchInterval: 5_000 });

  const manualHold = trpc.trading.trade.setManualHold.useMutation({
    onSuccess: async enabled => {
      toast.success(enabled?.manualHold ? "Manual Hold is active" : "Standard exit rules are active");
      await utils.trading.watchdog.status.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const requestClose = trpc.trading.trade.requestClose.useMutation({
    onSuccess: async () => {
      toast.warning("Close request queued for the persistent worker.");
      await utils.trading.watchdog.status.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  if (status.isLoading) return <MonitorSkeleton />;
  if (status.error) {
    return (
      <div className="mx-auto max-w-2xl pt-10">
        <Alert className="border-[#ff6b6b]/35 bg-[#ff6b6b]/10 text-[#e8e8ea]">
          <AlertTriangle className="h-4 w-4 text-[#ff6b6b]" />
          <AlertTitle>Owner access is required</AlertTitle>
          <AlertDescription>{status.error.message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const pair = status.data?.pair;
  const snapshot = status.data?.snapshot;
  const worker = status.data?.state;
  const net = Number(snapshot?.netInr ?? 0);
  const hasLiveSnapshot = Boolean(pair && snapshot);
  const workerStatus: string = worker?.status ?? "not_configured";
  const workerBadge = getWatchdogBadgePresentation(workerStatus);
  const workerTone = workerBadge.tone === "healthy" ? "text-[#3ddc84] border-[#3ddc84]/30 bg-[#3ddc84]/10" : workerBadge.tone === "emergency" ? "text-[#ff6b6b] border-[#ff6b6b]/30 bg-[#ff6b6b]/10" : workerBadge.tone === "neutral" ? "text-[#9a9aa2] border-[#3a3a42] bg-[#1a1a1e]" : "text-[#D4734E] border-[#D4734E]/30 bg-[#D4734E]/10";

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 pb-8">
      <header className="flex flex-col gap-4 border-b border-[#2a2a30] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-[-0.03em] text-[#e8e8ea] sm:text-2xl">TMT BTC <span className="text-[#D4734E]">Decay-Sell</span> Monitor</h1>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] ${workerTone}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${workerBadge.dot === "healthy" ? "bg-[#3ddc84]" : workerBadge.dot === "emergency" ? "bg-[#ff6b6b]" : workerBadge.dot === "neutral" ? "bg-[#9a9aa2]" : "bg-[#D4734E]"}`} />
              {workerBadge.label}
            </span>
          </div>
          <p className="mt-2 text-sm text-[#9a9aa2]">Five-second persistent watchdog · {runtime.data?.mode?.toUpperCase() ?? "UNAVAILABLE"} mode · server-side Delta access only</p>
        </div>
        <Button variant="outline" className="border-[#3a3a42] bg-[#1a1a1e] text-[#e8e8ea] hover:bg-[#222226] hover:text-[#e8e8ea]" onClick={() => void status.refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </header>

      {!pair ? (
        <section className="monitor-card flex min-h-80 flex-col items-center justify-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#D4734E]/30 bg-[#D4734E]/10 text-[#D4734E]"><CircleOff className="h-6 w-6" /></div>
          <h2 className="mt-5 text-lg font-semibold text-[#e8e8ea]">No adopted BTC option pair</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-[#9a9aa2]">Use Manual Adoption to select one verified short CE and one short PE with matching lots. The worker will stay idle until an owner explicitly adopts the pair.</p>
          <Button className="mt-6 bg-[#D4734E] text-[#121214] hover:bg-[#e5835e]" onClick={() => (window.location.href = "/adoption")}>Adopt Pair</Button>
        </section>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="monitor-card">
              <p className="monitor-label">BTC SPOT</p>
              <p className="mt-3 font-mono text-2xl font-bold tabular-nums text-[#e8e8ea]">{hasLiveSnapshot ? usd(Number(snapshot?.spot)) : "—"}</p>
              <p className="mt-3 text-xs text-[#9a9aa2]">Last poll: {worker?.lastPollAt ? formatIstTime(worker.lastPollAt) : "waiting"}</p>
            </article>
            <article className="monitor-card">
              <p className="monitor-label">NET P&amp;L</p>
              <p className={`mt-3 text-2xl font-bold tabular-nums ${net >= 0 ? "text-[#3ddc84]" : "text-[#ff6b6b]"}`}>{hasLiveSnapshot ? inr(net) : "—"}</p>
              <p className="mt-3 text-xs text-[#9a9aa2]">P&amp;L USD: {hasLiveSnapshot ? usd(Number(snapshot?.pnlUsd)) : "—"} · Fees: {hasLiveSnapshot ? inr(Number(snapshot?.feesInr)) : "—"}</p>
            </article>
            <article className="monitor-card">
              <p className="monitor-label">PROTECTION</p>
              <p className="mt-3 text-base font-semibold text-[#e8e8ea]">{pair.protectionStatus.replaceAll("_", " ")}</p>
              <p className="mt-3 text-xs leading-5 text-[#9a9aa2]">{pair.remainingLots || pair.lots} lots per leg remain · coupled 2× stop loss stays active.</p>
            </article>
            <article className="monitor-card">
              <p className="monitor-label">EXIT CONTROL</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div><p className="text-base font-semibold text-[#e8e8ea]">Manual Hold</p><p className="mt-1 text-[11px] text-[#9a9aa2]">TP, trailing, time only</p></div>
                <Switch
                  checked={pair.manualHold}
                  disabled={manualHold.isPending || pair.status !== "adopted"}
                  onCheckedChange={checked => manualHold.mutate({ pairId: pair.id, manualHold: checked })}
                  aria-label="Toggle Manual Hold"
                />
              </div>
              <p className={`mt-3 text-xs ${pair.manualHold ? "text-[#D4734E]" : "text-[#9a9aa2]"}`}>{pair.manualHold ? "Manual Hold is active. Stop-loss and maximum-loss exits remain active." : "All configured automated exits are active."}</p>
            </article>
          </section>

          {snapshot ? (
            <section className="grid gap-4 xl:grid-cols-2">
              <TradeLegCard label="CE" symbol={pair.ceSymbol} entry={Number(pair.ceEntry)} current={Number(snapshot.ceMark)} stop={Number(pair.ceStop)} />
              <TradeLegCard label="PE" symbol={pair.peSymbol} entry={Number(pair.peEntry)} current={Number(snapshot.peMark)} stop={Number(pair.peStop)} />
            </section>
          ) : (
            <section className="monitor-card flex items-center gap-3 text-sm text-[#D4734E]"><Activity className="h-5 w-5" /> Pair adopted. Waiting for the worker’s first verified market snapshot.</section>
          )}

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <article className="monitor-card">
              <div className="flex items-start justify-between gap-3"><div><p className="monitor-label">NET P&amp;L HISTORY</p><p className="mt-1 text-sm text-[#9a9aa2]">Rolling watchdog snapshots from the past six hours.</p></div><Activity className="h-4 w-4 text-[#D4734E]" /></div>
              <div className="mt-5"><PnlChart points={history.data ?? []} /></div>
            </article>
            <article className="monitor-card flex flex-col">
              <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#3ddc84]" /><p className="monitor-label">CLOSE POSITION</p></div>
              <p className="mt-4 text-sm leading-6 text-[#9a9aa2]">A confirmed request is durable. The worker uses actual exchange position sizes and submits reduce-only orders for this adopted pair only.</p>
              <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
                {([25, 50, 75, 100] as const).map(percent => <Button key={percent} disabled={requestClose.isPending || pair.status !== "adopted"} variant={percent === 100 ? "default" : "outline"} className={percent === 100 ? "bg-[#ff6b6b] text-[#121214] hover:bg-[#ff8585]" : "border-[#3a3a42] bg-[#222226] text-[#e8e8ea] hover:bg-[#2a2a30]"} onClick={() => setClosePercent(percent)}>{percent === 100 ? <XOctagon className="mr-1.5 h-4 w-4" /> : null} Close {percent}%</Button>)}
              </div>
              <AlertDialog open={closePercent !== null} onOpenChange={open => { if (!open) setClosePercent(null); }}>
                <AlertDialogContent className="border-[#3a3a42] bg-[#1a1a1e] text-[#e8e8ea]">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Queue a {closePercent}% paired reduce-only close?</AlertDialogTitle>
                    <AlertDialogDescription className="leading-6 text-[#9a9aa2]">This durable request closes <strong className="font-mono text-[#e8e8ea]">{closePercent}%</strong> of the remaining matched lots for <strong className="font-mono text-[#e8e8ea]">{pair.ceSymbol}</strong> and <strong className="font-mono text-[#e8e8ea]">{pair.peSymbol}</strong>. The worker verifies the actual exchange short sizes and does not touch unrelated positions.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-[#3a3a42] bg-transparent text-[#e8e8ea] hover:bg-[#222226] hover:text-[#e8e8ea]">Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-[#ff6b6b] text-[#121214] hover:bg-[#ff8585]" onClick={() => { if (closePercent) requestClose.mutate({ pairId: pair.id, closePercent, confirmed: true, reason: `Dashboard ${closePercent}% paired close` }); setClosePercent(null); }}>Queue {closePercent}% Close</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </article>
          </section>

          {worker?.status === "emergency" || worker?.status === "degraded" ? (
            <Alert className={worker.status === "emergency" ? "border-[#ff6b6b]/35 bg-[#ff6b6b]/10 text-[#e8e8ea]" : "border-[#D4734E]/35 bg-[#D4734E]/10 text-[#e8e8ea]"}>
              <AlertTriangle className={worker.status === "emergency" ? "h-4 w-4 text-[#ff6b6b]" : "h-4 w-4 text-[#D4734E]"} />
              <AlertTitle>{worker.status === "emergency" ? "Emergency intervention required" : "Watchdog degraded"}</AlertTitle>
              <AlertDescription>{worker.lastError ?? "Review the operational status page and the worker process logs before relying on automated protection."}</AlertDescription>
            </Alert>
          ) : null}
        </>
      )}
    </div>
  );
}
