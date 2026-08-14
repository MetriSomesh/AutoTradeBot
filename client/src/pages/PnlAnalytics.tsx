import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { BarChart3, ChartNoAxesCombined, CircleDollarSign, CircleX, ReceiptIndianRupee, Trophy, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type AnalyticsRange = "7d" | "15d" | "30d" | "all";

const ranges: Array<{ value: AnalyticsRange; label: string }> = [
  { value: "7d", label: "Last 7 days" },
  { value: "15d", label: "Last 15 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

const money = (value: number | null | undefined) => `₹${Number(value ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signedMoney = (value: number | null | undefined) => `${Number(value ?? 0) > 0 ? "+" : ""}${money(value)}`;
const colour = (value: number) => value >= 0 ? "#3ddc84" : "#ff6b6b";

function Metric({ label, value, detail, tone = "neutral", icon: Icon }: { label: string; value: string; detail: string; tone?: "neutral" | "positive" | "negative"; icon: typeof ReceiptIndianRupee }) {
  const toneClass = tone === "positive" ? "text-[#3ddc84]" : tone === "negative" ? "text-[#ff6b6b]" : "text-[#e8e8ea]";
  return <section className="monitor-card min-h-32 p-4"><div className="flex items-start justify-between gap-3"><div><p className="monitor-label">{label}</p><p className={`mt-3 text-xl font-bold tracking-[-0.03em] tabular-nums ${toneClass}`}>{value}</p></div><div className="rounded-lg border border-[#3a3a42] bg-[#222226] p-2 text-[#D4734E]"><Icon className="h-4 w-4" /></div></div><p className="mt-2 text-xs text-[#72727b]">{detail}</p></section>;
}

export default function PnlAnalytics() {
  const [range, setRange] = useState<AnalyticsRange>("7d");
  const analytics = trpc.trading.history.analytics.useQuery({ range });
  const data = analytics.data;
  const totals = data?.totals;
  const chartData = data?.daily.map(day => ({ ...day, label: new Date(`${day.date}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) })) ?? [];

  return <div className="mx-auto max-w-[1400px] space-y-6 pb-8">
    <header className="flex flex-col gap-4 border-b border-[#2a2a30] pb-5 xl:flex-row xl:items-end xl:justify-between"><div><p className="monitor-label">REALIZED PERFORMANCE</p><h1 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-[#e8e8ea]">P&amp;L Analytics</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[#9a9aa2]">Performance is calculated from verified paired full closes and recorded paired partial closes. Dates use India Standard Time; unrealized open-position P&amp;L is deliberately excluded.</p></div><div className="flex flex-wrap gap-2" aria-label="P&L date range">{ranges.map(item => <Button key={item.value} variant="outline" aria-pressed={range === item.value} onClick={() => setRange(item.value)} className={range === item.value ? "border-[#D4734E]/60 bg-[#D4734E]/15 text-[#e8e8ea] hover:bg-[#D4734E]/20 hover:text-[#e8e8ea]" : "border-[#3a3a42] bg-[#1a1a1e] text-[#9a9aa2] hover:bg-[#222226] hover:text-[#e8e8ea]"}>{item.label}</Button>)}</div></header>

    {analytics.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-32 rounded-2xl bg-[#1a1a1e]" />)}</div> : null}
    {analytics.error ? <Alert className="border-[#ff6b6b]/35 bg-[#ff6b6b]/10 text-[#e8e8ea]"><TriangleAlert className="h-4 w-4 text-[#ff6b6b]" /><AlertTitle>Analytics unavailable</AlertTitle><AlertDescription>{analytics.error.message}</AlertDescription></Alert> : null}
    {totals ? <><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Net realized P&L" value={signedMoney(totals.netInr)} detail={`${totals.eventCount} recorded close ${totals.eventCount === 1 ? "event" : "events"}`} tone={totals.netInr >= 0 ? "positive" : "negative"} icon={ReceiptIndianRupee} /><Metric label="Win rate" value={`${totals.winRate.toFixed(1)}%`} detail={`${totals.wins} gains · ${totals.losses} losses`} tone={totals.winRate >= 50 ? "positive" : "negative"} icon={Trophy} /><Metric label="Average close P&L" value={signedMoney(totals.averageInr)} detail="Per recorded full or partial close" tone={totals.averageInr >= 0 ? "positive" : "negative"} icon={CircleDollarSign} /><Metric label="Recorded fees" value={money(totals.feesInr)} detail="Included in the net figures shown" icon={ChartNoAxesCombined} /></section>
      <section className="grid gap-4 md:grid-cols-2"><Metric label="Best close" value={signedMoney(totals.bestTradeInr)} detail="Highest recorded realized P&L event" tone="positive" icon={Trophy} /><Metric label="Worst close" value={signedMoney(totals.worstTradeInr)} detail="Lowest recorded realized P&L event" tone="negative" icon={CircleX} /></section>
      {chartData.length ? <section className="grid gap-5 xl:grid-cols-2"><article className="monitor-card p-5"><div className="flex items-start justify-between gap-4"><div><p className="monitor-label">DAILY REALIZED P&amp;L</p><h2 className="mt-2 text-lg font-semibold text-[#e8e8ea]">Daily close performance</h2></div><BarChart3 className="h-5 w-5 text-[#D4734E]" /></div><div className="mt-5 h-80" aria-label="Daily realized profit and loss bar chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}><CartesianGrid vertical={false} stroke="#2a2a30" strokeDasharray="3 4" /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#72727b", fontSize: 10 }} /><YAxis tickLine={false} axisLine={false} width={58} tick={{ fill: "#72727b", fontSize: 10 }} tickFormatter={value => `₹${Number(value).toLocaleString("en-IN")}`} /><Tooltip cursor={{ fill: "#222226" }} contentStyle={{ background: "#222226", border: "1px solid #3a3a42", borderRadius: 10, color: "#e8e8ea", fontSize: 12 }} formatter={(value: number) => [money(value), "Net P&L"]} /><Bar dataKey="netInr" radius={[5, 5, 2, 2]}>{chartData.map((entry, index) => <Cell key={`${entry.date}-${index}`} fill={colour(entry.netInr)} />)}</Bar></BarChart></ResponsiveContainer></div></article>
        <article className="monitor-card p-5"><div className="flex items-start justify-between gap-4"><div><p className="monitor-label">CUMULATIVE REALIZED P&amp;L</p><h2 className="mt-2 text-lg font-semibold text-[#e8e8ea]">Running close result</h2></div><ChartNoAxesCombined className="h-5 w-5 text-[#D4734E]" /></div><div className="mt-5 h-80" aria-label="Cumulative realized profit and loss bar chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}><CartesianGrid vertical={false} stroke="#2a2a30" strokeDasharray="3 4" /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#72727b", fontSize: 10 }} /><YAxis tickLine={false} axisLine={false} width={58} tick={{ fill: "#72727b", fontSize: 10 }} tickFormatter={value => `₹${Number(value).toLocaleString("en-IN")}`} /><Tooltip cursor={{ fill: "#222226" }} contentStyle={{ background: "#222226", border: "1px solid #3a3a42", borderRadius: 10, color: "#e8e8ea", fontSize: 12 }} formatter={(value: number) => [money(value), "Cumulative P&L"]} /><Bar dataKey="cumulativeInr" radius={[5, 5, 2, 2]}>{chartData.map((entry, index) => <Cell key={`${entry.date}-${index}`} fill={colour(entry.cumulativeInr)} />)}</Bar></BarChart></ResponsiveContainer></div></article></section> : <section className="monitor-card flex min-h-72 flex-col items-center justify-center p-7 text-center"><BarChart3 className="h-9 w-9 text-[#D4734E]" /><h2 className="mt-4 text-lg font-semibold text-[#e8e8ea]">No realized P&amp;L in this period</h2><p className="mt-2 max-w-md text-sm leading-6 text-[#9a9aa2]">Charts appear after the worker records a completed paired full or partial close. Open-position marks remain on the Live Monitor.</p></section>}</> : null}
  </div>;
}
