"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className="glass-panel p-6 space-y-4" aria-describedby={state?.error ? "login-error" : undefined}>
      <div>
        <label htmlFor="username" className="block text-xs font-medium text-slate-300 mb-1">
          Username
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          required
          className="w-full rounded-lg bg-slate-900 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-xs font-medium text-slate-300 mb-1">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-lg bg-slate-900 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
      </div>
      {state?.error && (
        <p id="login-error" role="alert" className="text-xs text-rose-300">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white text-sm font-semibold py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-300"
      >
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
