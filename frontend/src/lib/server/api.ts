import "server-only";
import { redirect } from "next/navigation";
import { API_BASE, readSession } from "./session";
import type { Me } from "../types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

function describe(body: unknown, fallback: string): string {
  if (!body) return fallback;
  if (typeof body === "string") return body.slice(0, 300);
  if (typeof body === "object") {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
    return JSON.stringify(body).slice(0, 300);
  }
  return fallback;
}

/**
 * Server-side call to the Django API. There is no demo fallback: failures throw,
 * and callers show a real error state.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await readSession();
  if (!session) redirect("/login");

  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Token ${session.token}`,
        "X-Tenant-ID": session.tenantId,
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, "The Reskure API is not reachable. Check that the backend is running.");
  }

  if (response.status === 401) redirect("/login");
  const text = await response.text();
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) throw new ApiError(response.status, describe(body, `Request failed (${response.status}).`), body);
  return body as T;
}

export async function list<T>(path: string): Promise<T[]> {
  const body = await api<{ results?: T[] } | T[]>(path);
  return Array.isArray(body) ? body : (body.results ?? []);
}

export function getMe(): Promise<Me> {
  return api<Me>("/auth/me/");
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
