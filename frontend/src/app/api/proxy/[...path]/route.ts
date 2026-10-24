import { NextRequest } from "next/server";
import { API_BASE, readSession } from "@/lib/server/session";

// Only these API areas are reachable from the browser through this proxy.
const ALLOWED_PREFIXES = ["ai/", "auth/me", "network/", "ciso/", "cloud-security/"];
const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const PASS_HEADERS = ["content-type", "content-disposition", "content-security-policy", "x-content-type-options"];

function isSameOriginWrite(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const candidates = new Set<string>([request.nextUrl.host.toLowerCase()]);
  for (const h of [request.headers.get("x-forwarded-host"), request.headers.get("host")]) {
    if (h) {
      for (const part of h.split(",")) {
        const trimmed = part.trim().toLowerCase();
        if (trimmed) candidates.add(trimmed);
      }
    }
  }
  return candidates.has(originHost);
}

async function forward(request: NextRequest, ctx: RouteContext<"/api/proxy/[...path]">) {
  const { path } = await ctx.params;
  const joined = path.join("/");

  if (path.some((segment) => segment === ".." || segment === "." || segment.includes("\\"))) {
    return Response.json({ detail: "Invalid path." }, { status: 400 });
  }
  if (!ALLOWED_PREFIXES.some((prefix) => joined.startsWith(prefix))) {
    return Response.json({ detail: "Not found." }, { status: 404 });
  }

  const session = await readSession();
  if (!session) return Response.json({ detail: "Not signed in." }, { status: 401 });

  // Cookies are SameSite=Lax; also require a matching Origin/Host header on writes (including behind ngrok).
  if (WRITE_METHODS.has(request.method) && !isSameOriginWrite(request)) {
    return Response.json({ detail: "Cross-origin request rejected." }, { status: 403 });
  }

  const url = `${API_BASE}/${joined}${joined.endsWith("/") ? "" : "/"}${request.nextUrl.search}`;
  const headers: Record<string, string> = {
    Authorization: `Token ${session.token}`,
    "X-Tenant-ID": session.tenantId,
    Accept: request.headers.get("accept") ?? "application/json",
  };
  const contentType = request.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: request.method,
      headers,
      body: WRITE_METHODS.has(request.method) ? await request.arrayBuffer() : undefined,
      cache: "no-store",
    });
  } catch {
    return Response.json({ detail: "The Reskure API is not reachable." }, { status: 502 });
  }

  const out = new Headers();
  for (const name of PASS_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  return new Response(upstream.status === 204 ? null : await upstream.arrayBuffer(), { status: upstream.status, headers: out });
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
