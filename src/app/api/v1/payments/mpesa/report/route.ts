import { ApiError, apiErrorResponse, apiSuccess, parseJson } from "@/server/http";
import { reportPaymentIssue, reportPaymentIssueSchema, verifyReceipt } from "@/server/payments";
import { getGuestOrder } from "@/server/orders";
import { enforceRateLimit } from "@/server/rate-limit";
import { hashSecret } from "@/server/security";

export async function POST(request: Request) {
  try {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const input = await parseJson(request, reportPaymentIssueSchema);
    await enforceRateLimit(`mpesa-payment-report:${forwarded ?? "local"}`, 5, 300);
    await enforceRateLimit(`mpesa-payment-report-order:${hashSecret(`${input.orderNumber}:${input.accessToken}`)}`, 3, 300);
    const current = await getGuestOrder(input.orderNumber, input.accessToken);
    if (current.payment.status === "SUCCEEDED") return apiSuccess({ status: "SUCCEEDED", order: current });
    try {
      await verifyReceipt(input);
      return apiSuccess({ status: "SUCCEEDED", order: await getGuestOrder(input.orderNumber, input.accessToken) });
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== "RECEIPT_NOT_VERIFIED") throw error;
    }
    const report = await reportPaymentIssue(input);
    return apiSuccess({ ...report, order: await getGuestOrder(input.orderNumber, input.accessToken) }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
