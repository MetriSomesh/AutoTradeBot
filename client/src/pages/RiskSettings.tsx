import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Clock3, Save, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type FormState = {
  usdInr: string; maxTradeLossInr: string; maxDailyLossInr: string; profitTrailStartInr: string; profitTrailDrawdownInr: string;
  exitMode: "manual" | "auto"; autoProfitTargetInr: string; manualOnlyMode: boolean; liveArmed: boolean; liveArmConfirmation: string;
  scheduledEntryEnabled: boolean; scheduledEntryLots: string; scheduledEntryPremiumMin: string; scheduledEntryPremiumMax: string; scheduledEntryConfirmation: string;
};

const initialForm: FormState = {
  usdInr: "83", maxTradeLossInr: "1200", maxDailyLossInr: "2400", profitTrailStartInr: "600", profitTrailDrawdownInr: "300",
  exitMode: "manual", autoProfitTargetInr: "", manualOnlyMode: true, liveArmed: false, liveArmConfirmation: "",
  scheduledEntryEnabled: false, scheduledEntryLots: "120", scheduledEntryPremiumMin: "85", scheduledEntryPremiumMax: "120", scheduledEntryConfirmation: "",
};

export default function RiskSettings() {
  const settings = trpc.trading.settings.get.useQuery();
  const utils = trpc.useUtils();
  const [form, setForm] = useState<FormState>(initialForm);
  useEffect(() => {
    if (!settings.data) return;
    setForm({
      usdInr: settings.data.usdInr, maxTradeLossInr: settings.data.maxTradeLossInr, maxDailyLossInr: settings.data.maxDailyLossInr,
      profitTrailStartInr: settings.data.profitTrailStartInr, profitTrailDrawdownInr: settings.data.profitTrailDrawdownInr,
      exitMode: settings.data.exitMode, autoProfitTargetInr: settings.data.autoProfitTargetInr ?? "", manualOnlyMode: settings.data.manualOnlyMode,
      liveArmed: settings.data.liveArmed, liveArmConfirmation: "", scheduledEntryEnabled: settings.data.scheduledEntryEnabled,
      scheduledEntryLots: String(settings.data.scheduledEntryLots), scheduledEntryPremiumMin: settings.data.scheduledEntryPremiumMin,
      scheduledEntryPremiumMax: settings.data.scheduledEntryPremiumMax, scheduledEntryConfirmation: "",
    });
  }, [settings.data]);
  const update = trpc.trading.settings.update.useMutation({
    onSuccess: async () => { toast.success("Server-side risk settings saved."); await utils.trading.settings.get.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const setValue = (key: keyof FormState, value: string | boolean) => setForm(previous => ({ ...previous, [key]: value }));
  const submit = () => update.mutate({
    usdInr: Number(form.usdInr), maxTradeLossInr: Number(form.maxTradeLossInr), maxDailyLossInr: Number(form.maxDailyLossInr),
    profitTrailStartInr: Number(form.profitTrailStartInr), profitTrailDrawdownInr: Number(form.profitTrailDrawdownInr), exitMode: form.exitMode,
    autoProfitTargetInr: form.exitMode === "auto" ? Number(form.autoProfitTargetInr) : null, manualOnlyMode: form.manualOnlyMode,
    scheduledEntryEnabled: form.scheduledEntryEnabled, scheduledEntryLots: Number(form.scheduledEntryLots),
    scheduledEntryPremiumMin: Number(form.scheduledEntryPremiumMin), scheduledEntryPremiumMax: Number(form.scheduledEntryPremiumMax),
    scheduledEntryConfirmation: form.scheduledEntryConfirmation || undefined, liveArmed: form.liveArmed, liveArmConfirmation: form.liveArmConfirmation || undefined,
  });
  const field = (id: keyof Pick<FormState, "usdInr" | "maxTradeLossInr" | "maxDailyLossInr" | "profitTrailStartInr" | "profitTrailDrawdownInr">, label: string, help: string) => (
    <label key={id} className="block"><span className="text-sm font-medium text-[#e8e8ea]">{label}</span><Input id={id} inputMode="decimal" value={form[id]} onChange={event => setValue(id, event.target.value)} className="mt-2 border-[#3a3a42] bg-[#121214] text-[#e8e8ea] placeholder:text-[#72727b] focus-visible:ring-[#D4734E]" /><span className="mt-2 block text-xs leading-5 text-[#9a9aa2]">{help}</span></label>
  );
  if (settings.isLoading) return <Skeleton className="mx-auto h-[560px] max-w-4xl rounded-2xl bg-[#1a1a1e]" />;
  if (settings.error) return <Alert className="border-[#ff6b6b]/35 bg-[#ff6b6b]/10 text-[#e8e8ea]"><AlertTriangle className="h-4 w-4" /><AlertTitle>Risk settings unavailable</AlertTitle><AlertDescription>{settings.error.message}</AlertDescription></Alert>;

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-8">
      <header className="border-b border-[#2a2a30] pb-5"><p className="monitor-label">SERVER-SIDE CONTROLS</p><h1 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-[#e8e8ea]">Risk Settings</h1><p className="mt-2 text-sm text-[#9a9aa2]">These values are stored in MySQL and used by the persistent worker. Manage encrypted Delta credentials under Account &amp; Keys.</p></header>
      <Alert className="border-[#D4734E]/35 bg-[#D4734E]/10 text-[#e8e8ea]"><ShieldCheck className="h-4 w-4 text-[#D4734E]" /><AlertTitle>Safety exits remain active</AlertTitle><AlertDescription>Manual mode suppresses only take-profit, trailing, and time exits. Coupled stop loss, maximum-loss protection, confirmed closes, and emergency handling remain active.</AlertDescription></Alert>
      <section className="monitor-card">
        <div className="grid gap-6 md:grid-cols-2">{field("usdInr", "USD / INR rate", "Used to calculate INR P&L and risk thresholds.")}{field("maxTradeLossInr", "Maximum trade loss (INR)", "The worker closes the adopted pair at or below this net loss.")}{field("maxDailyLossInr", "Maximum daily loss (INR)", "A server-side guard for live-operation validation and manual review.")}{field("profitTrailStartInr", "Profit trail start (INR)", "High-water tracking begins only after this net INR profit in the 01:00–03:00 IST window.")}{field("profitTrailDrawdownInr", "Profit trail drawdown (INR)", "Closes after this drawdown from the intrawindow high when Auto mode is active.")}</div>
        <div className="mt-8 grid gap-4 border-t border-[#2a2a30] pt-6 md:grid-cols-2">
          <div className="rounded-xl border border-[#D4734E]/30 bg-[#D4734E]/10 p-4"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium text-[#e8e8ea]">Exit mode</p><p className="mt-1 text-xs leading-5 text-[#9a9aa2]">Manual keeps safety exits; Auto enables configured bot exits and the INR target.</p></div><div className="flex rounded-lg border border-[#3a3a42] p-1"><Button type="button" size="sm" variant={form.exitMode === "manual" ? "default" : "ghost"} className={form.exitMode === "manual" ? "bg-[#D4734E] text-[#121214] hover:bg-[#e5835e]" : "text-[#9a9aa2]"} onClick={() => setValue("exitMode", "manual")}>Manual</Button><Button type="button" size="sm" variant={form.exitMode === "auto" ? "default" : "ghost"} className={form.exitMode === "auto" ? "bg-[#3ddc84] text-[#121214] hover:bg-[#57e899]" : "text-[#9a9aa2]"} onClick={() => setValue("exitMode", "auto")}>Auto</Button></div></div>{form.exitMode === "auto" ? <div className="mt-4"><span className="text-sm font-medium text-[#e8e8ea]">Auto profit target (net INR)</span><Input inputMode="decimal" value={form.autoProfitTargetInr} onChange={event => setValue("autoProfitTargetInr", event.target.value)} placeholder="e.g. 600" className="mt-2 border-[#3ddc84]/40 bg-[#121214] text-[#e8e8ea] focus-visible:ring-[#3ddc84]" /></div> : null}</div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-[#2a2a30] bg-[#121214] p-4"><div><p className="text-sm font-medium text-[#e8e8ea]">Manual-only entries</p><p className="mt-1 text-xs leading-5 text-[#9a9aa2]">Keep this enabled unless you deliberately arm the demo scheduled-entry workflow below.</p></div><Switch checked={form.manualOnlyMode} onCheckedChange={value => setValue("manualOnlyMode", value)} /></div>
          <div className="rounded-xl border border-[#3ddc84]/30 bg-[#3ddc84]/10 p-4 md:col-span-2"><div className="flex items-center justify-between gap-4"><div className="flex gap-3"><Clock3 className="mt-0.5 h-5 w-5 text-[#3ddc84]" /><div><p className="text-sm font-medium text-[#e8e8ea]">Demo scheduled BTC entry — 10:00 PM IST</p><p className="mt-1 text-xs leading-5 text-[#9a9aa2]">Weekdays only. Selects next-day BTC CE and PE inside the premium band, sells both IOC legs, verifies equal fills, and flattens incomplete entries. This remains blocked until the MacBook environment is also armed.</p></div></div><Switch checked={form.scheduledEntryEnabled} onCheckedChange={value => { setValue("scheduledEntryEnabled", value); if (value) setValue("manualOnlyMode", false); }} /></div>{form.scheduledEntryEnabled ? <div className="mt-4 grid gap-4 md:grid-cols-3"><label><span className="text-xs font-medium text-[#e8e8ea]">Lots per leg</span><Input inputMode="numeric" value={form.scheduledEntryLots} onChange={event => setValue("scheduledEntryLots", event.target.value)} className="mt-2 border-[#3ddc84]/40 bg-[#121214] text-[#e8e8ea]" /></label><label><span className="text-xs font-medium text-[#e8e8ea]">Sell premium minimum</span><Input inputMode="decimal" value={form.scheduledEntryPremiumMin} onChange={event => setValue("scheduledEntryPremiumMin", event.target.value)} className="mt-2 border-[#3ddc84]/40 bg-[#121214] text-[#e8e8ea]" /></label><label><span className="text-xs font-medium text-[#e8e8ea]">Sell premium maximum</span><Input inputMode="decimal" value={form.scheduledEntryPremiumMax} onChange={event => setValue("scheduledEntryPremiumMax", event.target.value)} className="mt-2 border-[#3ddc84]/40 bg-[#121214] text-[#e8e8ea]" /></label><label className="md:col-span-3"><span className="text-xs font-medium text-[#e8e8ea]">Type confirmation</span><Input value={form.scheduledEntryConfirmation} onChange={event => setValue("scheduledEntryConfirmation", event.target.value)} placeholder="ARM DEMO SCHEDULED ENTRY" className="mt-2 border-[#3ddc84]/40 bg-[#121214] font-mono text-xs text-[#e8e8ea]" /></label></div> : null}</div>
          <div className="rounded-xl border border-[#D4734E]/30 bg-[#D4734E]/10 p-4 md:col-span-2"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium text-[#e8e8ea]">Arm live reduce-only closes</p><p className="mt-1 text-xs leading-5 text-[#9a9aa2]">Requires matching server environment gates. This does not enable live entries.</p></div><Switch checked={form.liveArmed} onCheckedChange={value => setValue("liveArmed", value)} /></div>{form.liveArmed ? <Input value={form.liveArmConfirmation} onChange={event => setValue("liveArmConfirmation", event.target.value)} placeholder="ARM LIVE REDUCE-ONLY CLOSES" className="mt-4 border-[#D4734E]/40 bg-[#121214] font-mono text-xs text-[#e8e8ea]" /> : null}</div>
        </div>
        <div className="mt-7 flex justify-end"><Button disabled={update.isPending} onClick={submit} className="bg-[#D4734E] text-[#121214] hover:bg-[#e5835e]"><Save className="mr-2 h-4 w-4" /> Save Risk Settings</Button></div>
      </section>
    </div>
  );
}
