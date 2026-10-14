import type { z } from "zod";
import type { ErrorCode, ErrorResponse } from "../contract.js";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export async function readJson(req: Request, maxBytes = 32_000): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new ApiError(413, "payload_too_large", "Request body is too large");
  const raw = await req.text();
  if (raw.length > maxBytes) throw new ApiError(413, "payload_too_large", "Request body is too large");
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
  }
}

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError(400, "validation_failed", "Some fields are missing or invalid", {
      issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return result.data;
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Logs only the error's class and database code/constraint. Postgres error
 * messages and details can echo row values, which may include personal data.
 */
export function logError(scope: string, err: unknown): void {
  const e = err as { name?: string; code?: string; constraint_name?: string; type?: string };
  console.error(
    JSON.stringify({ level: "error", scope, name: e?.name ?? typeof err, code: e?.code, constraint: e?.constraint_name, type: e?.type }),
  );
}

export function errorResponse(err: unknown, scope: string): Response {
  if (err instanceof ApiError) {
    const body: ErrorResponse = { error: err.code, message: err.message };
    if (err.details) body.details = err.details;
    return json(body, err.status, err.status === 429 ? { "retry-after": "60" } : {});
  }
  logError(scope, err);
  const body: ErrorResponse = { error: "internal_error", message: "Something went wrong. Please try again." };
  return json(body, 500);
}

/** Wraps a handler so thrown ApiErrors become JSON responses and nothing else leaks. */
export function endpoint(scope: string, fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await fn(req);
    } catch (err) {
      return errorResponse(err, scope);
    }
  };
}
