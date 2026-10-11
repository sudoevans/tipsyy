import { getRequestDatabase } from "@/server/db";
import { ApiError, apiErrorResponse } from "@/server/http";
import { getGuestOrder } from "@/server/orders";
import { enforceRateLimit } from "@/server/rate-limit";
import { hashSecret } from "@/server/security";

export const dynamic = "force-dynamic";

// One bounded connection observes persisted callbacks; it never queries Daraja.
export async function GET(
  request: Request,
  context: { params: Promise<{ orderNumber: string }> },
) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer "))
      throw new ApiError(
        401,
        "ORDER_ACCESS_REQUIRED",
        "Order access is required.",
      );
    const token = authorization.slice(7);
    const { orderNumber } = await context.params;
    await enforceRateLimit(
      "order-stream:" + hashSecret(orderNumber + ":" + token),
      6,
      60,
    );
    const database = getRequestDatabase();
    const initial = await getGuestOrder(orderNumber, token, database);
    const encoder = new TextEncoder();
    const deadline = Date.now() + 30_000;
    let stopped = false;
    let first = true;
    let previous = initial.status + ":" + initial.payment.status;
    const terminal = (status: string) =>
      !["PENDING", "RECONCILING"].includes(status);
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          if (stopped || request.signal.aborted) {
            controller.close();
            return;
          }
          if (first) {
            first = false;
            controller.enqueue(
              encoder.encode("data: " + JSON.stringify(initial) + "\n\n"),
            );
            if (terminal(initial.payment.status)) {
              stopped = true;
              controller.close();
            }
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 2_000));
          if (stopped || request.signal.aborted) {
            if (!stopped) controller.close();
            return;
          }
          if (Date.now() >= deadline) {
            stopped = true;
            controller.close();
            return;
          }
          const [state] = await database<
            { status: string; payment_status: string }[]
          >`
            SELECT o.status::text,p.status::text AS payment_status FROM orders o
            JOIN LATERAL (SELECT status FROM payments WHERE order_id=o.id ORDER BY created_at DESC LIMIT 1) p ON true
            WHERE o.order_number=${orderNumber} AND o.access_token_hash=${hashSecret(token)}
          `;
          if (!state) {
            stopped = true;
            controller.close();
            return;
          }
          const signature = state.status + ":" + state.payment_status;
          if (signature !== previous) {
            previous = signature;
            const snapshot = await getGuestOrder(orderNumber, token, database);
            if (stopped || request.signal.aborted) return;
            controller.enqueue(
              encoder.encode("data: " + JSON.stringify(snapshot) + "\n\n"),
            );
            if (terminal(snapshot.payment.status)) {
              stopped = true;
              controller.close();
            }
          } else {
            controller.enqueue(encoder.encode(": waiting for callback\n\n"));
          }
        } catch {
          if (!stopped) {
            stopped = true;
            controller.enqueue(
              encoder.encode("event: unavailable\ndata: {}\n\n"),
            );
            controller.close();
          }
        }
      },
      cancel() {
        stopped = true;
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "private, no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
