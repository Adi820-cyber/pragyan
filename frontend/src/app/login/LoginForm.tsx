"use client";

import { useActionState } from "react";
import { login } from "./actions";
import { Loader2 } from "lucide-react";
import { buttonClass, inputClass } from "@/components/ui/Panel";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form
      action={action}
      className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-6 space-y-4 shadow-xs"
      aria-describedby={state?.error ? "login-error" : undefined}
    >
      <div className="space-y-1.5">
        <label htmlFor="username" className="block text-xs font-medium text-zinc-300">
          Username
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          required
          disabled={pending}
          placeholder="admin"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-xs font-medium text-zinc-300">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
          placeholder="••••••••"
          className={inputClass}
        />
      </div>

      {state?.error && (
        <div id="login-error" role="alert" className="p-3 rounded-md border border-red-500/30 bg-red-500/10 text-xs text-red-200">
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className={`w-full ${buttonClass}`}
      >
        {pending ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            <span>Signing in...</span>
          </>
        ) : (
          <span>Sign in</span>
        )}
      </button>
    </form>
  );
}
