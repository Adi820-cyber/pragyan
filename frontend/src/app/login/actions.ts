"use server";

import { redirect } from "next/navigation";
import { API_BASE, clearSession, readSession, setTenant, writeSession } from "@/lib/server/session";
import type { Me } from "@/lib/types";

export type LoginState = { error?: string } | undefined;

export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { error: "Enter your username and password." };

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/auth/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      cache: "no-store",
    });
  } catch {
    return { error: "The Reskure API is not reachable. Check that the backend is running." };
  }
  if (response.status === 429) return { error: "Too many attempts. Wait a minute and try again." };
  if (!response.ok) return { error: "Invalid username or password." };

  const data = (await response.json()) as Me & { token: string };
  const first = data.memberships[0];
  if (!first) return { error: "This account is not a member of any organisation." };

  await writeSession(data.token, first.tenant_id);
  redirect("/");
}

export async function logout() {
  const session = await readSession();
  if (session) {
    await fetch(`${API_BASE}/auth/logout/`, {
      method: "POST",
      headers: { Authorization: `Token ${session.token}`, "X-Tenant-ID": session.tenantId },
      cache: "no-store",
    }).catch(() => undefined);
  }
  await clearSession();
  redirect("/login");
}

export async function switchTenant(formData: FormData) {
  const tenantId = String(formData.get("tenant") ?? "");
  const session = await readSession();
  if (!session || !tenantId) redirect("/login");
  // The API rejects a tenant the user is not a member of, so check before storing it.
  const response = await fetch(`${API_BASE}/auth/me/`, {
    headers: { Authorization: `Token ${session.token}`, "X-Tenant-ID": tenantId },
    cache: "no-store",
  });
  if (response.ok) {
    const me = (await response.json()) as Me;
    if (me.active_membership?.tenant_id === tenantId) await setTenant(tenantId);
  }
  redirect("/");
}
