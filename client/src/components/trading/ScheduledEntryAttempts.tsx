import { formatIstDateTime } from "@/lib/istTime";
import { trpc } from "@/lib/trpc";

const tone: Record<string, string> = {
  opened: "bg-[#3ddc84]/10 text-[#3ddc84]",
  flattened: "bg-[#ff6b6b]/10 text-[#ff6b6b]",
  failed: "bg-[#ff6b6b]/10 text-[#ff6b6b]",
  skipped: "bg-[#D4734E]/10 text-[#D4734E]",
  started: "bg-[#D4734E]/10 text-[#D4734E]",
};

export function ScheduledEntryAttempts() {
  const attempts = trpc.trading.history.scheduledAttempts.useQuery({ limit: 8 }, { refetchInterval: 15_000 });
  return (
    <section className="monitor-card">
      <div className="flex items-center justify-between gap-3"><p className="monitor-label">SCHEDULED DEMO ENTRY AUDIT</p><span className="text-xs text-[#72727b]">Latest 8 attempts</span></div>
      {attempts.data?.length ? <div className="mt-4 divide-y divide-[#2a2a30]">{attempts.data.map(attempt => <div key={attempt.id} className="py-3"><div className="flex items-center justify-between gap-3"><div><p className="font-mono text-xs text-[#e8e8ea]">{attempt.istTradeDate} · {attempt.triggerTimeIst} IST · {attempt.requestedLots} lots per leg</p><p className="mt-1 text-xs text-[#9a9aa2]">{attempt.ceSymbol ?? "CE not selected"} / {attempt.peSymbol ?? "PE not selected"}</p></div><span className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${tone[attempt.status] ?? tone.started}`}>{attempt.status}</span></div><p className="mt-1 text-xs text-[#9a9aa2]">Fill reconciliation: CE {attempt.ceFilledLots}/{attempt.requestedLots} · PE {attempt.peFilledLots}/{attempt.requestedLots}</p>{attempt.error ? <p className="mt-1 text-xs leading-5 text-[#ff8f8f]">{attempt.error}</p> : null}<p className="mt-1 font-mono text-[10px] text-[#72727b]">{formatIstDateTime(attempt.updatedAt)}</p></div>)}</div> : <p className="mt-4 text-sm text-[#9a9aa2]">No scheduled demo entry attempts have been recorded.</p>}
    </section>
  );
}
