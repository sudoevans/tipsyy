// @ts-ignore `.open-next/worker.js` is generated after Next's type-check completes.
import generatedWorker from "../.open-next/worker.js";

type WorkerEnvironment = {
  APP_URL?: string;
  INTERNAL_JOB_SECRET?: string;
  HYPERDRIVE?: { connectionString: string };
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
}

function fetch(request: Request, env: WorkerEnvironment, context: WorkerContext) {
  setRuntimeBindings(env);
  return app.fetch(request, env, context);
}

async function runMaintenance(env: WorkerEnvironment, context: WorkerContext) {
  if (!env.APP_URL || !env.INTERNAL_JOB_SECRET) {
    console.error("Maintenance job is not configured: APP_URL or INTERNAL_JOB_SECRET is missing.");
    return;
  }

  const url = new URL("/api/v1/internal/maintenance", env.APP_URL);
  const response = await app.fetch(
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
