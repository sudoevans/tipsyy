import { getMpesaTransactionStatusConfig } from "./env";
import { requestMpesaTransactionStatus, transactionStatusMetadata, type TransactionStatusResultPayload } from "./mpesa";
import { publishAdminNotification } from "./admin-notifications";
import { sql, withTransaction } from "./db";
import { normalizeKenyanPhone } from "./security";

function resultReceipt(payload: TransactionStatusResultPayload, metadata: Record<string, unknown>) {
  return String(payload.Result?.TransactionID ?? metadata.ReceiptNo ?? metadata.MpesaReceiptNumber ?? "").trim().toUpperCase();
}

function resultPhone(metadata: Record<string, unknown>) {
  const candidate = Object.values(metadata).map(String).find((value) => /254[17]\d{8}/.test(value));
  if (!candidate) return null;
  const phone = candidate.match(/254[17]\d{8}/)?.[0];
  if (!phone) return null;
  try { return normalizeKenyanPhone(phone); } catch { return null; }
}

export async function processOpenPaymentInvestigations(limit = 10) {
  if (!getMpesaTransactionStatusConfig()) return { processed: 0, configured: false };
  const cases = await sql<{ id: string; claimed_receipt: string }[]>`
    SELECT id, claimed_receipt FROM payment_investigations
    WHERE status = 'OPEN'
       OR (status = 'RECONCILING' AND (provider_checked_at IS NULL OR provider_checked_at < now() - interval '2 minutes'))
    ORDER BY reported_at ASC LIMIT ${Math.max(1, Math.min(limit, 25))}
  `;
  let processed = 0;
  for (const investigation of cases) {
    await sql`
      UPDATE payment_investigations SET status = 'RECONCILING', provider_error = NULL, updated_at = now()
      WHERE id = ${investigation.id} AND status IN ('OPEN', 'RECONCILING')
    `;
    try {
      const provider = await requestMpesaTransactionStatus({ receipt: investigation.claimed_receipt, investigationId: investigation.id });
      const providerReference = typeof provider?.response.OriginatorConversationID === "string"
        ? provider.response.OriginatorConversationID
        : typeof provider?.response.ConversationID === "string"
          ? provider.response.ConversationID
          : null;
      await sql`
        UPDATE payment_investigations
        SET provider_reference = ${providerReference}, provider_result = ${sql.json(JSON.parse(JSON.stringify(provider?.response ?? {})))}, provider_checked_at = now(), updated_at = now()
        WHERE id = ${investigation.id}
      `;
      processed += 1;
    } catch (error) {
      await sql`
        UPDATE payment_investigations
        SET status = 'OPEN', provider_checked_at = now(),
            provider_error = ${error instanceof Error ? error.message : "Unable to request M-Pesa transaction status."}, updated_at = now()
        WHERE id = ${investigation.id}
      `;
    }
  }
  return { processed, configured: true };
}

export async function processMpesaTransactionStatusResult(payload: TransactionStatusResultPayload) {
  const metadata = transactionStatusMetadata(payload);
  const receipt = resultReceipt(payload, metadata);
  if (!receipt) return { processed: false, reason: "missing_receipt" };
  return withTransaction(async (tx) => {
    const [record] = await tx<{
      id: string;
      amount_minor: number;
      customer_phone: string;
    }[]>`
      SELECT i.id, p.amount_minor, o.customer_phone
      FROM payment_investigations i
      JOIN payments p ON p.id = i.payment_id
      JOIN orders o ON o.id = i.order_id
      WHERE lower(i.claimed_receipt) = lower(${receipt})
        AND i.status IN ('OPEN', 'RECONCILING', 'MATCHED')
      ORDER BY i.reported_at DESC LIMIT 1
      FOR UPDATE OF i, p, o
    `;
    if (!record) {
      await publishAdminNotification(tx, {
        eventType: "UNMATCHED_MPESA_RECONCILIATION",
        entityType: "mpesa_receipt",
        entityId: receipt,
        severity: "CRITICAL",
        title: "Unmatched M-Pesa reconciliation result",
        body: "M-Pesa returned a transaction-status result that is not linked to an open customer report.",
        href: "/admin/transactions",
      });
      return { processed: false, reason: "unmatched" };
    }
    const amount = Number(metadata.Amount);
    const payerPhone = resultPhone(metadata);
    const isVerified = payload.Result?.ResultCode === 0 && Number.isFinite(amount) && amount === record.amount_minor && payerPhone === record.customer_phone;
    await tx`
      UPDATE payment_investigations
      SET status = ${isVerified ? "MATCHED" : "RECONCILING"}::payment_investigation_status, provider_result = ${tx.json(payload)},
          provider_checked_at = now(), provider_error = ${isVerified ? null : "The provider response did not conclusively match the expected amount and payer phone."}, updated_at = now()
      WHERE id = ${record.id}
    `;
    await publishAdminNotification(tx, {
      eventType: "PAYMENT_INVESTIGATION",
      entityType: "payment_investigation",
      entityId: record.id,
      severity: isVerified ? "WARNING" : "CRITICAL",
      title: isVerified ? "Payment matched by M-Pesa" : "Payment still needs review",
      body: isVerified ? "M-Pesa returned matching payment details. An administrator must now confirm the order." : "M-Pesa did not return enough matching details to settle this payment automatically.",
      href: "/admin/transactions",
    });
    return { processed: true, matched: isVerified };
  });
}

export async function processMpesaTransactionStatusTimeout(payload: TransactionStatusResultPayload) {
  const reference = payload.Result?.OriginatorConversationID;
  if (!reference) return { processed: false };
  await sql`
    UPDATE payment_investigations
    SET status = 'OPEN', provider_error = 'M-Pesa transaction status request timed out.', updated_at = now()
    WHERE provider_reference = ${reference} AND status = 'RECONCILING'
  `;
  return { processed: true };
}
