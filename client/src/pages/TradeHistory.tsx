import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadBase64File } from "@/lib/download";
import { formatIstDateTime } from "@/lib/istTime";
import { trpc } from "@/lib/trpc";
import { BookOpenCheck, Download, History, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const money = (value: string) => `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TradeHistory() {
  const history = trpc.trading.history.closedTrades.useQuery({ limit: 100 });
  const tradeExport = trpc.trading.exports.tradeHistory.useMutation({ onSuccess: file => { downloadBase64File(file); toast.success("Trade-history workbook downloaded."); }, onError: error => toast.error(error.message) });
  const monitorExport = trpc.trading.exports.liveMonitor.useMutation({ onSuccess: file => { downloadBase64File(file); toast.success("Live-monitor workbook downloaded."); }, onError: error => toast.error(error.message) });
  return (
    <div className="mx-auto max-w-[1400px] space-y-6 pb-8">
      <header className="flex flex-col gap-4 border-b border-[#2a2a30] pb-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="monitor-label">IMMUTABLE LEDGER</p><h1 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-[#e8e8ea]">Closed Trade History</h1><p className="mt-2 text-sm text-[#9a9aa2]">Closed pair records are stored server-side with recorded exit marks, fees, net INR, and the close reason.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={monitorExport.isPending} onClick={() => monitorExport.mutate()} className="border-[#3a3a42] bg-[#1a1a1e] text-[#e8e8ea] hover:bg-[#222226] hover:text-[#e8e8ea]"><Download className="mr-2 h-4 w-4" /> Live Monitor XLSX</Button><Button disabled={tradeExport.isPending} onClick={() => tradeExport.mutate()} className="bg-[#D4734E] text-[#121214] hover:bg-[#e5835e]"><Download className="mr-2 h-4 w-4" /> Trade History XLSX</Button></div></header>
      {history.isLoading ? <Skeleton className="h-80 rounded-2xl bg-[#1a1a1e]" /> : null}
      {history.error ? <Alert className="border-[#ff6b6b]/35 bg-[#ff6b6b]/10 text-[#e8e8ea]"><TriangleAlert className="h-4 w-4 text-[#ff6b6b]" /><AlertTitle>History unavailable</AlertTitle><AlertDescription>{history.error.message}</AlertDescription></Alert> : null}
      {history.data?.length === 0 ? <section className="monitor-card flex min-h-72 flex-col items-center justify-center text-center"><History className="h-8 w-8 text-[#D4734E]" /><h2 className="mt-4 font-semibold text-[#e8e8ea]">No closed pairs yet</h2><p className="mt-2 max-w-sm text-sm leading-6 text-[#9a9aa2]">When the worker completes a paired reduce-only close, its recorded values and reason appear here.</p></section> : null}
      {history.data?.length ? <section className="overflow-hidden rounded-2xl border border-[#2a2a30] bg-[#1a1a1e]"><div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-sm"><thead className="bg-[#222226] text-[10px] uppercase tracking-[0.12em] text-[#9a9aa2]"><tr><th className="px-4 py-3">Close Time (IST)</th><th className="px-4 py-3">CE / PE</th><th className="px-4 py-3">Lots</th><th className="px-4 py-3">Entry</th><th className="px-4 py-3">Exit</th><th className="px-4 py-3">P&amp;L USD</th><th className="px-4 py-3">Fees INR</th><th className="px-4 py-3">Net INR</th><th className="px-4 py-3">Note</th></tr></thead><tbody className="divide-y divide-[#2a2a30]">{history.data.map(trade => <tr key={trade.id} className="text-[#e8e8ea]"><td className="whitespace-nowrap px-4 py-4 font-mono text-xs text-[#9a9aa2]">{formatIstDateTime(trade.closedAt)}</td><td className="px-4 py-4"><p className="font-mono text-xs">{trade.ceSymbol}</p><p className="mt-1 font-mono text-xs text-[#9a9aa2]">{trade.peSymbol}</p></td><td className="px-4 py-4 tabular-nums">{trade.lots}</td><td className="px-4 py-4 font-mono text-xs">${Number(trade.ceEntry).toFixed(2)} / ${Number(trade.peEntry).toFixed(2)}</td><td className="px-4 py-4 font-mono text-xs">${Number(trade.ceExit).toFixed(2)} / ${Number(trade.peExit).toFixed(2)}</td><td className="px-4 py-4 tabular-nums">${Number(trade.pnlUsd).toFixed(2)}</td><td className="px-4 py-4 tabular-nums text-[#9a9aa2]">{money(trade.feesInr)}</td><td className={`px-4 py-4 font-semibold tabular-nums ${Number(trade.netInr) >= 0 ? "text-[#3ddc84]" : "text-[#ff6b6b]"}`}>{money(trade.netInr)}</td><td className="max-w-xs px-4 py-4 text-xs leading-5 text-[#9a9aa2]">{trade.note ?? "—"}</td></tr>)}</tbody></table></div></section> : null}
      <p className="flex items-center gap-2 text-xs text-[#72727b]"><BookOpenCheck className="h-4 w-4" /> The ledger is populated by verified worker close completion; it does not infer unrecorded manual account activity.</p>
    </div>
  );
}
