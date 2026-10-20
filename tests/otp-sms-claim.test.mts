import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import postgres from "postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

test("OTP SMS claim locks and returns one due message", { skip: !databaseUrl }, async () => {
  const db = postgres(databaseUrl!, { max: 1 });
  const rollback = Symbol("rollback");
  try {
    await db.begin(async (tx) => {
      const [existing] = await tx`SELECT to_regclass('otp_sms_messages') IS NOT NULL AS present`;
      if (!existing.present) {
        await tx.unsafe(await readFile("db/migrations/024_blessedtexts_otp.sql", "utf8"));
      }
      const [otp] = await tx<{ id: string }[]>`
        INSERT INTO phone_otps(phone,purpose,code_hash,expires_at)
        VALUES('254700000001','LOGIN','test-only',now()+interval '5 minutes') RETURNING id
      `;
      const requestId = crypto.randomUUID();
      const [message] = await tx<{ id: string }[]>`
        INSERT INTO otp_sms_messages(otp_id,request_id,phone_masked,purpose,encrypted_body)
        VALUES(${otp.id},${requestId},'0700 *** 001','LOGIN','test-only') RETURNING id
      `;
      const [claimed] = await tx<{ id: string; attempts: number }[]>`
        UPDATE otp_sms_messages m SET status='PROCESSING',locked_at=now(),attempts=m.attempts+1,updated_at=now()
        FROM (
          SELECT m2.id FROM otp_sms_messages m2 JOIN phone_otps o ON o.id=m2.otp_id
          WHERE m2.id=${message.id} AND m2.attempts < 3 AND o.expires_at > now() AND o.consumed_at IS NULL
            AND ((m2.status IN ('PENDING','UNKNOWN') AND m2.next_attempt_at <= now())
              OR (m2.status='PROCESSING' AND m2.locked_at < now()-interval '30 seconds'))
          FOR UPDATE OF m2 SKIP LOCKED
        ) candidate, phone_otps o
        WHERE m.id=candidate.id AND o.id=m.otp_id
        RETURNING m.id,m.attempts
      `;
      assert.equal(claimed.id, message.id);
      assert.equal(claimed.attempts, 1);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await db.end();
  }
});
