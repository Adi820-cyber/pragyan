import "server-only";
import { cookies } from "next/headers";

export const TOKEN_COOKIE = "reskure_token";
export const TENANT_COOKIE = "reskure_tenant";
function getApiBase() {
  let raw = (process.env.API_BASE_URL ?? "http://localhost:8000/api/v1").trim();
  if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
    raw = raw.includes("localhost") || raw.includes("127.0.0.1") || !raw.includes(".")
      ? `http://${raw}`
      : `https://${raw}`;
  }
  const trimmed = raw.replace(/\/+$/, "");
  return trimmed.endsWith("/api/v1") ? trimmed : `${trimmed}/api/v1`;
}
export const API_BASE = getApiBase();

const MAX_AGE_SECONDS = 60 * 60 * 12;

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };
}

export async function readSession(): Promise<{ token: string; tenantId: string } | null> {
  const jar = await cookies();
  const token = jar.get(TOKEN_COOKIE)?.value;
  const tenantId = jar.get(TENANT_COOKIE)?.value;
  return token && tenantId ? { token, tenantId } : null;
}

export async function writeSession(token: string, tenantId: string) {
  const jar = await cookies();
  jar.set(TOKEN_COOKIE, token, cookieOptions());
  jar.set(TENANT_COOKIE, tenantId, cookieOptions());
}

export async function setTenant(tenantId: string) {
  const jar = await cookies();
  jar.set(TENANT_COOKIE, tenantId, cookieOptions());
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(TOKEN_COOKIE);
  jar.delete(TENANT_COOKIE);
}
