import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Loader2, UserPlus } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

export default function SignUp() {
  const [, navigate] = useLocation();
  const registration = trpc.auth.registrationStatus.useQuery();
  const signUp = trpc.auth.signUp.useMutation({ onSuccess: () => navigate("/account") });
  const [form, setForm] = useState({ name: "", email: "", username: "", password: "", confirmPassword: "" });
  const [localError, setLocalError] = useState("");
  if (registration.isLoading) return <main className="auth-shell"><section className="auth-panel"><Loader2 className="animate-spin" /></section></main>;
  return <main className="auth-shell"><section className="auth-panel"><div className="auth-mark"><UserPlus size={22} /> TMT</div><p className="eyebrow">FIRST-TIME SETUP</p><h1>Create your local account.</h1><p className="auth-copy">The first registered account becomes the administrator for this server. Use a unique password of at least 12 characters.</p>{!registration.data?.registrationAllowed ? <p className="auth-error">Registration is disabled by this server administrator.</p> : <form className="auth-form" onSubmit={event => { event.preventDefault(); if (form.password !== form.confirmPassword) return setLocalError("Passwords do not match."); setLocalError(""); signUp.mutate({ name: form.name, email: form.email, username: form.username.toLowerCase(), password: form.password }); }}><div><Label htmlFor="name">Display name</Label><Input id="name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required /></div><div><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} required /></div><div><Label htmlFor="signup-username">Username</Label><Input id="signup-username" autoComplete="username" value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} placeholder="3–32 lowercase characters" required /></div><div><Label htmlFor="signup-password">Password</Label><Input id="signup-password" type="password" autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} required /></div><div><Label htmlFor="confirm-password">Confirm password</Label><Input id="confirm-password" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={event => setForm({ ...form, confirmPassword: event.target.value })} required /></div>{(localError || signUp.error?.message) && <p className="auth-error">{localError || signUp.error?.message}</p>}<Button type="submit" className="auth-submit" disabled={signUp.isPending}>{signUp.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />} Create account</Button></form>}<p className="auth-footer">Already registered? <Link href="/signin">Sign in</Link></p></section></main>;
}
