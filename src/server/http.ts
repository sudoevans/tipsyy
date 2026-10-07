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

export function apiErrorResponse(error: unknown, requestId = crypto.randomUUID()) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details, requestId } },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Some submitted details are invalid.", details: error.flatten(), requestId } },
      { status: 422 },
    );
  }

  console.error(JSON.stringify({
    level: "error",
    requestId,
    message: "Unhandled API error",
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage: error instanceof Error ? error.message : String(error),
    error,
  }));
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again.", requestId } },
    { status: 500 },
  );
}
