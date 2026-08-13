type TradeLegCardProps = {
  label: "CE" | "PE";
  symbol: string;
  entry: number;
  current: number;
  stop: number;
};

const usd = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function TradeLegCard({ label, symbol, entry, current, stop }: TradeLegCardProps) {
  const change = entry > 0 ? ((current - entry) / entry) * 100 : 0;
  const stopProgress = stop > entry ? Math.min(100, Math.max(0, ((current - entry) / (stop - entry)) * 100)) : 0;
  const isDecay = change <= 0;
  const barClass = isDecay ? "bg-[#3ddc84]" : stopProgress > 70 ? "bg-[#ff6b6b]" : "bg-[#D4734E]";

  return (
    <section className="monitor-card" aria-label={`${label} option leg`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="monitor-label">{label} LEG</p>
          <p className="mt-1 max-w-[16rem] truncate font-mono text-xs text-[#9a9aa2]">{symbol}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold ${isDecay ? "border-[#3ddc84]/30 bg-[#3ddc84]/10 text-[#3ddc84]" : "border-[#D4734E]/30 bg-[#D4734E]/10 text-[#D4734E]"}`}>
          {isDecay ? "DECAY" : "RISING"}
        </span>
      </div>
      <dl className="mt-5 divide-y divide-[#2a2a30]">
        <div className="metric-row"><dt>Entry</dt><dd>{usd(entry)}</dd></div>
        <div className="metric-row"><dt>Current</dt><dd>{usd(current)}</dd></div>
        <div className="metric-row"><dt>SL (2×)</dt><dd>{usd(stop)}</dd></div>
        <div className="metric-row"><dt>Change</dt><dd className={isDecay ? "text-[#3ddc84]" : "text-[#ff6b6b]"}>{change >= 0 ? "+" : ""}{change.toFixed(1)}%</dd></div>
      </dl>
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-[#72727b]">
          <span>Stop distance</span><span>{stopProgress.toFixed(0)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#222226]" aria-label={`${stopProgress.toFixed(0)} percent of stop distance used`}>
          <div className={`h-full rounded-full transition-[width] duration-300 ease-out ${barClass}`} style={{ width: `${stopProgress}%` }} />
        </div>
      </div>
    </section>
  );
}
