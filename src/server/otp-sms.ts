import { sendBlessedTextsOtp } from "./blessedtexts";
import { sql } from "./db";
import { decryptPlatformSecret } from "./security";
import { classifyOtpAttempt } from "./otp-sms-policy";

type ClaimedSms = {
  id: string;
  request_id: string;
  phone: string;
  encrypted_body: string;
  attempts: number;
};

function logSms(input: { event: string; smsId: string; requestId: string; attempt: number; outcome?: string; category?: string; providerStatusCode?: string }) {
  console.info(JSON.stringify({ level: "info", service: "blessedtexts_otp", ...input }));
}

export async function dispatchOtpSms(id: string) {
  const claimed = await sql.begin(async (tx) => {
    const [sms] = await tx<ClaimedSms[]>`
      UPDATE otp_sms_messages m SET status='PROCESSING',locked_at=now(),attempts=m.attempts+1,updated_at=now()
      FROM (
        SELECT m2.id FROM otp_sms_messages m2 JOIN phone_otps o ON o.id=m2.otp_id
        WHERE m2.id=${id} AND m2.attempts < 3 AND o.expires_at > now() AND o.consumed_at IS NULL
          AND ((m2.status IN ('PENDING','UNKNOWN') AND m2.next_attempt_at <= now())
            OR (m2.status='PROCESSING' AND m2.locked_at < now()-interval '30 seconds'))
        FOR UPDATE OF m2 SKIP LOCKED
      ) candidate, phone_otps o
      WHERE m.id=candidate.id AND o.id=m.otp_id
      RETURNING m.id,m.request_id,o.phone,m.encrypted_body,m.attempts
    `;
    if (!sms) return null;
    await tx`UPDATE otp_sms_attempts SET status='UNKNOWN',failure_category='INTERRUPTED',finished_at=now()
      WHERE message_id=${sms.id} AND status='PROCESSING' AND attempt_number < ${sms.attempts}`;
    await tx`INSERT INTO otp_sms_attempts(message_id,attempt_number) VALUES(${sms.id},${sms.attempts})`;
    return sms;
  });
  if (!claimed) return null;
  logSms({ event: "otp_sms.attempt_started", smsId: claimed.id, requestId: claimed.request_id, attempt: claimed.attempts });

  let result: Awaited<ReturnType<typeof sendBlessedTextsOtp>>;
  try {
    result = await sendBlessedTextsOtp(claimed.phone, decryptPlatformSecret(claimed.encrypted_body));
  } catch {
    result = { outcome: "FAILED", failureCategory: "LOCAL_SEND_ERROR" };
  }
  const { status, category } = classifyOtpAttempt(result, claimed.attempts);
  let persistedStatus: string | null;
  try {
    persistedStatus = await sql.begin(async (tx) => {
      await tx`
        UPDATE otp_sms_attempts SET status=${result.outcome},http_status=${result.httpStatus ?? null},
          provider_status_code=${result.providerStatusCode ?? null},provider_message_id=${result.providerMessageId ?? null},
          failure_category=${category},finished_at=now()
        WHERE message_id=${claimed.id} AND attempt_number=${claimed.attempts}
      `;
      const [updated] = await tx<{ status: string }[]>`
        UPDATE otp_sms_messages SET status=${status},provider_status_code=${result.providerStatusCode ?? null},
          provider_message_id=${result.providerMessageId ?? null},failure_category=${category},
          accepted_at=CASE WHEN ${status}='SENT' THEN now() ELSE accepted_at END,
          encrypted_body=CASE WHEN ${status} IN ('SENT','FAILED') THEN NULL ELSE encrypted_body END,
          next_attempt_at=now()+make_interval(secs => ${Math.min(60, 10 * 2 ** (claimed.attempts - 1))}),
          locked_at=NULL,updated_at=now()
        WHERE id=${claimed.id} AND status='PROCESSING' AND attempts=${claimed.attempts}
        RETURNING status
      `;
      return updated?.status ?? null;
    });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", service: "blessedtexts_otp", event: "otp_sms.result_persist_failed",
      smsId: claimed.id, requestId: claimed.request_id, attempt: claimed.attempts,
      errorName: error instanceof Error ? error.name : typeof error }));
    throw error;
  }
  logSms({ event: "otp_sms.attempt_finished", smsId: claimed.id, requestId: claimed.request_id,
    attempt: claimed.attempts, outcome: persistedStatus ?? "SUPERSEDED_OR_EXPIRED", category: category ?? undefined,
    providerStatusCode: result.providerStatusCode });
  return persistedStatus;
}

export async function dispatchPendingOtpSms(limit = 4) {
  await sql`UPDATE otp_sms_attempts a SET status='UNKNOWN',failure_category='INTERRUPTED',finished_at=now()
    FROM otp_sms_messages m WHERE a.message_id=m.id AND a.status='PROCESSING'
      AND m.status='PROCESSING' AND m.locked_at < now()-interval '30 seconds' AND m.attempts >= 3`;
  const abandoned = await sql<{ id: string; request_id: string; attempts: number }[]>`
    UPDATE otp_sms_messages SET status='FAILED',failure_category='UNCONFIRMED_AFTER_RETRIES',encrypted_body=NULL,locked_at=NULL,updated_at=now()
    WHERE status='PROCESSING' AND locked_at < now()-interval '30 seconds' AND attempts >= 3
    RETURNING id,request_id,attempts`;
  for (const message of abandoned) logSms({ event: "otp_sms.retry_exhausted", smsId: message.id,
    requestId: message.request_id, attempt: message.attempts, outcome: "FAILED" });
  const expired = await sql<{ id: string; request_id: string; attempts: number }[]>`
    UPDATE otp_sms_messages m SET status='EXPIRED',encrypted_body=NULL,locked_at=NULL,updated_at=now()
    FROM phone_otps o WHERE m.otp_id=o.id AND m.status IN ('PENDING','UNKNOWN','PROCESSING')
      AND (o.expires_at <= now() OR o.consumed_at IS NOT NULL)
    RETURNING m.id,m.request_id,m.attempts
  `;
  for (const message of expired) logSms({ event: "otp_sms.expired", smsId: message.id,
    requestId: message.request_id, attempt: message.attempts, outcome: "EXPIRED" });
  const pending = await sql<{ id: string }[]>`
    SELECT m.id FROM otp_sms_messages m JOIN phone_otps o ON o.id=m.otp_id
    WHERE m.attempts < 3 AND o.expires_at > now() AND o.consumed_at IS NULL
      AND ((m.status IN ('PENDING','UNKNOWN') AND m.next_attempt_at <= now())
        OR (m.status='PROCESSING' AND m.locked_at < now()-interval '30 seconds'))
    ORDER BY m.next_attempt_at LIMIT ${Math.max(1, Math.min(8, limit))}
  `;
  const outcomes = await Promise.all(pending.map((message) => dispatchOtpSms(message.id)));
  return { processed: outcomes.filter(Boolean).length, sent: outcomes.filter((value) => value === "SENT").length };
}
