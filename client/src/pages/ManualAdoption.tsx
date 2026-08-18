import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { getUnderlyingDetails, type SupportedOptionUnderlying } from "@/lib/optionUnderlying";
import { AlertTriangle, ArrowDownToLine, CheckCircle2, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function ManualAdoption() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const candidates = trpc.trading.delta.manualCandidates.useQuery();
  const [ceProductId, setCeProductId] = useState<number | null>(null);
  const [peProductId, setPeProductId] = useState<number | null>(null);
  const [underlying, setUnderlying] = useState<SupportedOptionUnderlying>("BTC");
  const ceCandidates = useMemo(() => candidates.data?.ce.filter(item => item.underlying === underlying) ?? [], [candidates.data?.ce, underlying]);
  const peCandidates = useMemo(() => candidates.data?.pe.filter(item => item.underlying === underlying) ?? [], [candidates.data?.pe, underlying]);
  const selectedCe = useMemo(() => ceCandidates.find(item => item.productId === ceProductId), [ceCandidates, ceProductId]);
  const selectedPe = useMemo(() => peCandidates.find(item => item.productId === peProductId), [peCandidates, peProductId]);
  const matchingLots = selectedCe && selectedPe && selectedCe.size === selectedPe.size && selectedCe.underlying === selectedPe.underlying;

  const adopt = trpc.trading.trade.adoptManualPair.useMutation({
    onSuccess: async () => {
      toast.success("Manual CE/PE pair adopted. The worker will begin monitoring it on the next cycle.");
      await Promise.all([utils.trading.trade.active.invalidate(), utils.trading.watchdog.status.invalidate()]);
      setLocation("/");
    },
    onError: error => toast.error(error.message),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-8">
      <header className="border-b border-[#2a2a30] pb-5">
        <p className="monitor-label">EXPLICIT ACCOUNT IMPORT</p>
        <h1 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-[#e8e8ea]">Adopt a Manual CE / PE Pair</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#9a9aa2]">The dashboard reads your authenticated Delta account and allows one deliberate selection of an open short BTC or Gold Token (XAUT) call and put with equal lots. It never auto-adopts every position and does not change existing exchange brackets.</p>
      </header>

      <Alert className="border-[#D4734E]/35 bg-[#D4734E]/10 text-[#e8e8ea]">
        <ShieldAlert className="h-4 w-4 text-[#D4734E]" />
        <AlertTitle>What adoption authorizes</AlertTitle>
        <AlertDescription>It authorizes the worker to monitor this selected pair and to submit reduce-only closes only for these two recorded product IDs after a risk trigger or confirmed close request.</AlertDescription>
      </Alert>

      {candidates.isLoading ? <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-64 rounded-2xl bg-[#1a1a1e]" /><Skeleton className="h-64 rounded-2xl bg-[#1a1a1e]" /></div> : null}
      {candidates.error ? <Alert className="border-[#ff6b6b]/35 bg-[#ff6b6b]/10 text-[#e8e8ea]"><AlertTriangle className="h-4 w-4 text-[#ff6b6b]" /><AlertTitle>Candidate discovery is unavailable</AlertTitle><AlertDescription>{candidates.error.message}</AlertDescription></Alert> : null}
      {candidates.data ? (
        <>
          <section className="grid gap-4 md:grid-cols-2">
            <article className="monitor-card md:col-span-2">
              <p className="monitor-label">OPTION UNDERLYING</p>
              <label className="mt-4 block text-xs font-medium text-[#e8e8ea]" htmlFor="underlying">Select one underlying</label>
              <select id="underlying" value={underlying} onChange={event => { const next = event.target.value as SupportedOptionUnderlying; setUnderlying(next); setCeProductId(null); setPeProductId(null); }} className="mt-2 h-11 w-full rounded-xl border border-[#3a3a42] bg-[#121214] px-3 font-mono text-sm text-[#e8e8ea] outline-none focus:border-[#D4734E]">
                <option value="BTC">BTC · Bitcoin</option>
                <option value="XAUT">GOLD / XAUT · Tether Gold Token</option>
              </select>
              <p className="mt-3 text-xs leading-5 text-[#9a9aa2]">Only matching CE and PE legs from the same selected underlying can be adopted.</p>
            </article>
            <article className="monitor-card">
              <p className="monitor-label">SHORT {getUnderlyingDetails(underlying).monitorLabel} CALLS</p>
              <label className="mt-5 block text-xs font-medium text-[#e8e8ea]" htmlFor="ce-product">CE position</label>
              <select id="ce-product" value={ceProductId ?? ""} onChange={event => setCeProductId(event.target.value ? Number(event.target.value) : null)} className="mt-2 h-11 w-full rounded-xl border border-[#3a3a42] bg-[#121214] px-3 font-mono text-sm text-[#e8e8ea] outline-none focus:border-[#D4734E]">
                <option value="">Select a short CE position</option>
                {ceCandidates.map(candidate => <option key={candidate.productId} value={candidate.productId}>{candidate.symbol} · {candidate.size} lots · entry ${candidate.entryPrice.toFixed(2)}</option>)}
              </select>
              <p className="mt-4 text-xs leading-5 text-[#9a9aa2]">Only open short C-{underlying}-* positions reported by Delta are listed.</p>
            </article>
            <article className="monitor-card">
              <p className="monitor-label">SHORT {getUnderlyingDetails(underlying).monitorLabel} PUTS</p>
              <label className="mt-5 block text-xs font-medium text-[#e8e8ea]" htmlFor="pe-product">PE position</label>
              <select id="pe-product" value={peProductId ?? ""} onChange={event => setPeProductId(event.target.value ? Number(event.target.value) : null)} className="mt-2 h-11 w-full rounded-xl border border-[#3a3a42] bg-[#121214] px-3 font-mono text-sm text-[#e8e8ea] outline-none focus:border-[#D4734E]">
                <option value="">Select a short PE position</option>
                {peCandidates.map(candidate => <option key={candidate.productId} value={candidate.productId}>{candidate.symbol} · {candidate.size} lots · entry ${candidate.entryPrice.toFixed(2)}</option>)}
              </select>
              <p className="mt-4 text-xs leading-5 text-[#9a9aa2]">Only open short P-{underlying}-* positions reported by Delta are listed.</p>
            </article>
          </section>

          {selectedCe && selectedPe ? (
            <section className={`rounded-2xl border p-4 ${matchingLots ? "border-[#3ddc84]/30 bg-[#3ddc84]/10" : "border-[#ff6b6b]/30 bg-[#ff6b6b]/10"}`}>
              <div className="flex gap-3"><CheckCircle2 className={`mt-0.5 h-5 w-5 shrink-0 ${matchingLots ? "text-[#3ddc84]" : "text-[#ff6b6b]"}`} /><div><p className="font-semibold text-[#e8e8ea]">{matchingLots ? "Pair sizes match" : "Pair sizes do not match"}</p><p className="mt-1 text-sm text-[#9a9aa2]">CE: {selectedCe.symbol} ({selectedCe.size} lots) · PE: {selectedPe.symbol} ({selectedPe.size} lots)</p></div></div>
            </section>
          ) : null}

          <div className="flex justify-end">
            <AlertDialog>
              <AlertDialogTrigger asChild><Button disabled={!matchingLots || adopt.isPending} className="bg-[#D4734E] text-[#121214] hover:bg-[#e5835e]"><ArrowDownToLine className="mr-2 h-4 w-4" /> Adopt Selected Pair</Button></AlertDialogTrigger>
              <AlertDialogContent className="border-[#3a3a42] bg-[#1a1a1e] text-[#e8e8ea]">
                <AlertDialogHeader><AlertDialogTitle>Confirm manual pair adoption</AlertDialogTitle><AlertDialogDescription className="leading-6 text-[#9a9aa2]">The worker will monitor and may reduce-only close exactly this matching short pair: <strong className="font-mono text-[#e8e8ea]">{selectedCe?.symbol}</strong> and <strong className="font-mono text-[#e8e8ea]">{selectedPe?.symbol}</strong>. Existing Delta brackets are left unchanged.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel className="border-[#3a3a42] bg-transparent text-[#e8e8ea] hover:bg-[#222226] hover:text-[#e8e8ea]">Cancel</AlertDialogCancel><AlertDialogAction className="bg-[#D4734E] text-[#121214] hover:bg-[#e5835e]" onClick={() => { if (ceProductId && peProductId) adopt.mutate({ ceProductId, peProductId, confirmed: true }); }}>Confirm Adoption</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </>
      ) : null}
    </div>
  );
}
