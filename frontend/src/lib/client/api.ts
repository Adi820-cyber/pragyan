"use client";

/** Browser-side calls go through the Next.js proxy route, which attaches the session token. */
export class ClientApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

function flatten(body: unknown): string {
  if (!body) return "";
  if (typeof body === "string") return body;
  if (Array.isArray(body)) return body.map(flatten).filter(Boolean).join(" ");
  if (typeof body === "object") {
    return Object.entries(body as Record<string, unknown>)
      .map(([key, value]) => {
        const text = flatten(value);
        return key === "detail" || key === "non_field_errors" ? text : `${key}: ${text}`;
      })
      .filter(Boolean)
      .join(" ");
  }
  return String(body);
}

export async function call<T = unknown>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const response = await fetch(`/api/proxy/${path.replace(/^\//, "")}`, {
    method,
    headers: isForm || body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    cache: "no-store",
  });
  if (response.status === 401) {
    window.location.assign("/login");
    throw new ClientApiError(401, "Your session has ended. Please sign in again.");
  }
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    /* keep text */
  }
  if (!response.ok) {
    throw new ClientApiError(response.status, flatten(parsed) || `Request failed (${response.status}).`, parsed);
  }
  return parsed as T;
}

export async function callText(path: string): Promise<string> {
  const response = await fetch(`/api/proxy/${path.replace(/^\//, "")}`, { cache: "no-store" });
  if (!response.ok) throw new ClientApiError(response.status, `Request failed (${response.status}).`);
  return response.text();
}

export const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
