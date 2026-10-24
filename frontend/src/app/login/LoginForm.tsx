"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, KeyRound, Shield, UserCheck, Briefcase } from "lucide-react";
import { login } from "./actions";

const DEMO_ACCOUNTS = [
  {
    username: "admin",
    password: "Password123!",
    label: "Admin (Full Access)",
    role: "Tenant Administrator",
    hint: "Full administrative access across AI Audits, CISO Assistant, Cloud Security & Network.",
    icon: Shield,
  },
  {
    username: "founder@hirelens.example",
    password: "Password123!",
    label: "Asha Rao (Risk Owner)",
    role: "ML Lead / Owner",
    hint: "Owns AI systems, uploads datasets & evidence, and submits findings for review.",
    icon: Briefcase,
  },
  {
    username: "advisor@hirelens.example",
    password: "Password123!",
    label: "Vikram Shah (Reviewer)",
    role: "Compliance Officer",
    hint: "Independent reviewer for Segregation-of-Duties (SoD) sign-off on findings & controls.",
    icon: UserCheck,
  },
];

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("Password123!");
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-4">
      <form action={action} className="glass-panel p-6 space-y-4" aria-describedby={state?.error ? "login-error" : undefined}>
        <div>
          <label htmlFor="username" className="block text-xs font-medium text-slate-300 mb-1">
            Username or Email
          </label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
            className="w-full rounded-lg bg-slate-900 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-xs font-medium text-slate-300 mb-1">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-slate-900 border border-white/10 pl-3 pr-9 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200 focus:outline-none"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        {state?.error && (
          <p id="login-error" role="alert" className="text-xs text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded-lg p-2.5">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white text-sm font-semibold py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-300"
        >
          {pending ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <div className="glass-panel p-4 space-y-2.5 border border-cyan-500/20">
        <div className="flex items-center gap-2 text-xs font-semibold text-cyan-300">
          <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Demo Accounts (Click to Autofill)</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          All demo accounts share password <code className="text-slate-200 font-mono">Password123!</code>. Switch between Owner and Reviewer to test Segregation of Duties (SoD).
        </p>
        <div className="space-y-1.5 pt-1">
          {DEMO_ACCOUNTS.map((acc) => {
            const Icon = acc.icon;
            const active = username === acc.username;
            return (
              <button
                key={acc.username}
                type="button"
                onClick={() => {
                  setUsername(acc.username);
                  setPassword(acc.password);
                }}
                className={`w-full text-left p-2.5 rounded-lg border transition-colors flex items-start gap-2.5 ${
                  active
                    ? "bg-cyan-500/15 border-cyan-500/40 text-white"
                    : "bg-slate-900/50 border-white/10 text-slate-300 hover:bg-white/5"
                }`}
              >
                <Icon className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-100">{acc.label}</span>
                    <span className="text-[10px] font-mono text-cyan-300">{acc.username}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{acc.hint}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
