import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function AccountSettings() {
  const utils = trpc.useUtils();
  const status = trpc.trading.account.deltaCredentialStatus.useQuery();
  const [environment, setEnvironment] = useState<"demo" | "live">("demo");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const save = trpc.trading.account.saveDeltaCredential.useMutation({ onSuccess: () => { setApiKey(""); setApiSecret(""); void utils.trading.account.deltaCredentialStatus.invalidate(); toast.success("Encrypted Delta credential saved."); } });
  const configured = status.data?.configured;
  return <div className="page-stack"><header className="page-heading"><div><p className="eyebrow">ACCOUNT SECURITY</p><h1>Connect your Delta account</h1><p>Credentials are encrypted before storage and decrypted only by the server while signing your own exchange requests.</p></div></header><Card className="tmt-card"><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound size={18} /> Bring your own API key</CardTitle><CardDescription>Use a dedicated trading-only key without withdrawal permission. Your raw key and secret are never displayed again.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="credential-state">{configured ? <><CheckCircle2 size={18} className="text-emerald-400" /><span><strong>Connected</strong> · {status.data?.environment?.toUpperCase()} · fingerprint {status.data?.keyFingerprint}</span></> : <><ShieldCheck size={18} className="text-amber-300" /><span>No encrypted Delta credential stored yet.</span></>}</div><form className="grid gap-4 max-w-2xl" onSubmit={event => { event.preventDefault(); save.mutate({ environment, apiKey, apiSecret, confirmed: true }); }}><div><Label htmlFor="environment">Environment</Label><Select value={environment} onValueChange={value => setEnvironment(value as "demo" | "live")}><SelectTrigger id="environment"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="demo">Demo / testnet</SelectItem><SelectItem value="live">Live — requires separate live arming</SelectItem></SelectContent></Select></div><div><Label htmlFor="delta-key">Delta API key</Label><Input id="delta-key" autoComplete="off" spellCheck={false} value={apiKey} onChange={event => setApiKey(event.target.value)} required /></div><div><Label htmlFor="delta-secret">Delta API secret</Label><Input id="delta-secret" type="password" autoComplete="new-password" spellCheck={false} value={apiSecret} onChange={event => setApiSecret(event.target.value)} required /></div>{save.error && <p className="auth-error">{save.error.message}</p>}<Button type="submit" className="w-fit" disabled={save.isPending}>{save.isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Encrypt and save credential</Button></form></CardContent></Card></div>;
}
