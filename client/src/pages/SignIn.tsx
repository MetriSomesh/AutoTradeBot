import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";

export default function SignIn() {
  const [, navigate] = useLocation();
  const { isAuthenticated, loading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const signIn = trpc.auth.signIn.useMutation({ onSuccess: () => navigate("/") });
  useEffect(() => { if (isAuthenticated) navigate("/"); }, [isAuthenticated, navigate]);
  const message = signIn.error?.message;

  return <main className="auth-shell"><section className="auth-panel"><div className="auth-mark"><ShieldCheck size={22} /> TMT</div><p className="eyebrow">SELF-HOSTED CONTROL</p><h1>Sign in to your trading workspace.</h1><p className="auth-copy">Your session is stored in an HTTP-only cookie. Delta credentials remain encrypted on your server.</p><form className="auth-form" onSubmit={event => { event.preventDefault(); signIn.mutate({ username, password }); }}><div><Label htmlFor="username">Username</Label><Input id="username" autoComplete="username" value={username} onChange={event => setUsername(event.target.value.toLowerCase())} placeholder="trader_name" required /></div><div><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></div>{message && <p className="auth-error">{message}</p>}<Button type="submit" className="auth-submit" disabled={signIn.isPending || loading}>{signIn.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />} Sign in</Button></form><p className="auth-footer">New to this self-hosted instance? <Link href="/signup">Create an account</Link></p></section></main>;
}
