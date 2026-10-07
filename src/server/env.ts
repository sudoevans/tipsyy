import { z } from "zod";

const optionalString = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  schema.optional(),
);

const baseSchema = z.object({
  DATABASE_URL: z.string().url().default("postgresql://tipsy:tipsy_local_password@localhost:5432/tipsy"),
  APP_URL: z.string().url().default("http://localhost:3005"),
  SESSION_SECRET: optionalString(z.string().min(32)),
  MPESA_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
  MPESA_CONSUMER_KEY: optionalString(z.string().min(1)),
  MPESA_CONSUMER_SECRET: optionalString(z.string().min(1)),
  MPESA_SHORTCODE: optionalString(z.string().regex(/^\d+$/)),
  MPESA_PASSKEY: optionalString(z.string().min(1)),
  MPESA_TRANSACTION_TYPE: z.enum(["CustomerPayBillOnline", "CustomerBuyGoodsOnline"]).default("CustomerPayBillOnline"),
  MPESA_CALLBACK_URL: optionalString(z.string().url()),
  MPESA_CALLBACK_TOKEN: optionalString(z.string().min(24)),
  MPESA_ACCOUNT_REFERENCE: z.string().min(1).max(12).default("TipsyTheory"),
  OTP_PROVIDER_URL: optionalString(z.string().url()),
  OTP_PROVIDER_TOKEN: optionalString(z.string().min(1)),
  OTP_SENDER_ID: z.string().min(1).max(20).default("TipsyTheory"),
  GOOGLE_CLIENT_ID: optionalString(z.string().min(1)),
  GOOGLE_CLIENT_SECRET: optionalString(z.string().min(1)),
  INTERNAL_JOB_SECRET: optionalString(z.string().min(24)),
});

export type ServerEnv = z.infer<typeof baseSchema>;

export function getServerEnv(): ServerEnv {
  const parsed = baseSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid server environment: ${z.prettifyError(parsed.error)}`);
  }

  // Read the live server environment for each request. This prevents a stale
  // development-module cache from retaining missing payment configuration after
  // `.env.local` is updated, while keeping production behavior deterministic.
  return parsed.data;
}

export function requireSessionSecret(): string {
  const secret = getServerEnv().SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for authentication.");
  return secret;
}

export function requireMpesaConfig() {
  const env = getServerEnv();
  const required = {
    consumerKey: env.MPESA_CONSUMER_KEY,
    consumerSecret: env.MPESA_CONSUMER_SECRET,
    shortcode: env.MPESA_SHORTCODE,
    passkey: env.MPESA_PASSKEY,
    callbackToken: env.MPESA_CALLBACK_TOKEN,
  };

  const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`M-Pesa is not configured. Missing: ${missing.join(", ")}.`);
  }

  const callbackUrl = new URL(env.MPESA_CALLBACK_URL ?? `${env.APP_URL}/api/v1/payments/mpesa/callback`);
  callbackUrl.searchParams.set("token", required.callbackToken!);
  return {
    environment: env.MPESA_ENVIRONMENT,
    consumerKey: required.consumerKey!,
    consumerSecret: required.consumerSecret!,
    shortcode: required.shortcode!,
    passkey: required.passkey!,
    transactionType: env.MPESA_TRANSACTION_TYPE,
    accountReference: env.MPESA_ACCOUNT_REFERENCE,
    callbackUrl: callbackUrl.toString(),
  };
}
