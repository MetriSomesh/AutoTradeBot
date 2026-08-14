import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { IST_TIME_ZONE } from "@/lib/istTime";

type PnlPoint = { capturedAt: Date; netInr: string };

export function PnlChart({ points }: { points: PnlPoint[] }) {
  const data = points.map(point => ({
    at: new Date(point.capturedAt).toLocaleTimeString("en-IN", { timeZone: IST_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }),
    net: Number(point.netInr),
  }));

  if (data.length < 2) {
    return <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-[#2a2a30] text-sm text-[#9a9aa2]">Collecting watchdog history…</div>;
  }

  return (
    <div className="h-44" aria-label="Rolling net profit and loss chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="tmtPnlFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#D4734E" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#D4734E" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#2a2a30" strokeDasharray="3 4" />
          <XAxis dataKey="at" tickLine={false} axisLine={false} minTickGap={24} tick={{ fill: "#72727b", fontSize: 10 }} />
          <YAxis tickLine={false} axisLine={false} width={54} tick={{ fill: "#72727b", fontSize: 10 }} tickFormatter={value => `₹${Number(value).toLocaleString("en-IN")}`} />
          <Tooltip
            cursor={{ stroke: "#D4734E", strokeDasharray: "3 3" }}
            contentStyle={{ background: "#222226", border: "1px solid #2a2a30", borderRadius: 10, color: "#e8e8ea", fontSize: 12 }}
            formatter={(value: number) => [`₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`, "Net P&L"]}
          />
          <Area type="monotone" dataKey="net" stroke="#D4734E" fill="url(#tmtPnlFill)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
