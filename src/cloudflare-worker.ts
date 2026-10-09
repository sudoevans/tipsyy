// @ts-ignore `.open-next/worker.js` is generated after Next's type-check completes.
import generatedWorker from "../.open-next/worker.js";
import { withRequestDatabaseClient } from "./server/db";

type WorkerEnvironment = {
  APP_URL?: string;
  INTERNAL_JOB_SECRET?: string;
  HYPERDRIVE?: { connectionString: string };
  [key: string]: unknown;
};

type WorkerContext = {
  waitUntil(promise: Promise<unknown>): void;
};

type GeneratedWorker = {
  fetch(request: Request, env: WorkerEnvironment, context: WorkerContext): Promise<Response>;
};

const app = generatedWorker as GeneratedWorker;

function setRuntimeBindings(env: WorkerEnvironment) {
  (globalThis as typeof globalThis & { tipsyHyperdriveConnectionString?: string }).tipsyHyperdriveConnectionString =
    env.HYPERDRIVE?.connectionString;
  for (const key of [
    "APP_URL", "SESSION_SECRET", "MPESA_ENVIRONMENT", "MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET",
    "MPESA_SHORTCODE", "MPESA_PASSKEY", "MPESA_TRANSACTION_TYPE", "MPESA_CALLBACK_URL", "MPESA_CALLBACK_TOKEN",
    "MPESA_ACCOUNT_REFERENCE", "MPESA_TRANSACTION_STATUS_INITIATOR", "MPESA_TRANSACTION_STATUS_SECURITY_CREDENTIAL",
    "MPESA_TRANSACTION_STATUS_RESULT_URL", "MPESA_TRANSACTION_STATUS_TIMEOUT_URL", "OTP_PROVIDER_URL", "OTP_PROVIDER_TOKEN",
    "OTP_SENDER_ID", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "INTERNAL_JOB_SECRET",
  ]) {
    const value = env[key];
    if (typeof value === "string") process.env[key] = value;
  }
}

function fetch(request: Request, env: WorkerEnvironment, context: WorkerContext) {
  setRuntimeBindings(env);
  if (!env.HYPERDRIVE?.connectionString) return app.fetch(request, env, context);
  return withRequestDatabaseClient(env.HYPERDRIVE.connectionString, () => app.fetch(request, env, context));
}

async function runMaintenance(env: WorkerEnvironment, context: WorkerContext) {
  if (!env.APP_URL || !env.INTERNAL_JOB_SECRET) {
    console.error("Maintenance job is not configured: APP_URL or INTERNAL_JOB_SECRET is missing.");
    return;
  }

  const url = new URL("/api/v1/internal/maintenance", env.APP_URL);
  const response = env.HYPERDRIVE?.connectionString
    ? await withRequestDatabaseClient(env.HYPERDRIVE.connectionString, () => app.fetch(
        new Request(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${env.INTERNAL_JOB_SECRET}` },
        }),
        env,
        context,
      ))
    : await app.fetch(
        new Request(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${env.INTERNAL_JOB_SECRET}` },
        }),
        env,
        context,
      );
  if (!response.ok) {
    throw new Error(`Maintenance request failed with ${response.status}.`);
  }
}

const worker = {
  fetch,
  scheduled(_controller: unknown, env: WorkerEnvironment, context: WorkerContext) {
    setRuntimeBindings(env);
    context.waitUntil(runMaintenance(env, context));
  },
};

export default worker;
