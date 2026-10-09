import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "The request body must be valid JSON.");
  }

  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(422, "VALIDATION_ERROR", "Some submitted details are invalid.", result.error.flatten());
  }
  return result.data;
}

export function apiSuccess<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

function safeDatabaseDiagnostics(error: unknown) {
  if (typeof error !== "object" || error === null) return {};
  const fields = error as Record<string, unknown>;
  const diagnostics: Record<string, string> = {};
  const sqlState = fields.code;
  if (typeof sqlState === "string" && /^[0-9A-Z]{5}$/.test(sqlState)) {
    diagnostics.sqlState = sqlState;
  }
  for (const [source, target] of [
    ["severity", "dbSeverity"],
    ["schema_name", "dbSchema"],
    ["table_name", "dbTable"],
    ["column_name", "dbColumn"],
    ["constraint_name", "dbConstraint"],
  ] as const) {
    const value = fields[source];
    if (typeof value === "string" && /^[A-Za-z0-9_.-]{1,120}$/.test(value)) {
      diagnostics[target] = value;
    }
  }
  return diagnostics;
}

export function apiErrorResponse(
  error: unknown,
  requestId = crypto.randomUUID(),
  route?: string,
) {
  if (error instanceof ApiError) {
    console.warn(JSON.stringify({
      level: error.status >= 500 ? "error" : "warn",
      event: "api.error",
      requestId,
      ...(route ? { route } : {}),
      status: error.status,
      code: error.code,
      errorType: error.name,
    }));
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details, requestId } },
      { status: error.status, headers: { "x-request-id": requestId } },
    );
  }

  if (error instanceof ZodError) {
    console.warn(JSON.stringify({ level: "warn", event: "api.validation_error", requestId }));
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Some submitted details are invalid.", details: error.flatten(), requestId } },
      { status: 422, headers: { "x-request-id": requestId } },
    );
  }

  console.error(JSON.stringify({
    level: "error",
    event: "api.unhandled_error",
    requestId,
    ...(route ? { route } : {}),
    message: "Unhandled API error. See errorType; request and customer data are intentionally excluded.",
    errorName: error instanceof Error ? error.name : typeof error,
    ...safeDatabaseDiagnostics(error),
  }));
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again.", requestId } },
    { status: 500, headers: { "x-request-id": requestId } },
  );
}
