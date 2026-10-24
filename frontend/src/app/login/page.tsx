import { LoginForm } from "./LoginForm";
import { Shield } from "lucide-react";

export const metadata = { title: "Sign in — Reskure" };

export default function LoginPage() {
  return (
    <main className="min-h-dvh flex items-center justify-center p-6 bg-zinc-950">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-zinc-900 border border-zinc-700 flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-zinc-200" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-zinc-100 tracking-tight leading-none">Reskure</h1>
            <p className="text-xs text-zinc-400 mt-1 leading-none">AI Assurance & Audit Platform</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
