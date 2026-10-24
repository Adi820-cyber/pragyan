import { LoginForm } from "./LoginForm";
import { ShieldCheck } from "lucide-react";

export const metadata = { title: "Sign in | Reskure AI Audit" };

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-cyan-600 via-sky-500 to-indigo-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Reskure AI Audit</h1>
            <p className="text-xs text-slate-400">Responsible AI checks for small teams</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
