import { apiErrorResponse, apiSuccess, parseJson } from "@/server/http";
import { reportPaymentIssue, reportPaymentIssueSchema } from "@/server/payments";
import { enforceRateLimit } from "@/server/rate-limit";
import { hashSecret } from "@/server/security";

export async function POST(request: Request) {
  try {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const input = await parseJson(request, reportPaymentIssueSchema);
    await enforceRateLimit(`mpesa-payment-report:${forwarded ?? "local"}`, 5, 300);
    await enforceRateLimit(`mpesa-payment-report-order:${hashSecret(`${input.orderNumber}:${input.accessToken}`)}`, 3, 300);
    return apiSuccess(await reportPaymentIssue(input), { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
