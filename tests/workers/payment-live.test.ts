import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { createPaymentLiveToken, PAYMENT_LIVE_COOKIE } from "../../src/server/payment-live-auth";
import worker from "./worker";

const secret = "test-only-session-secret-never-used-in-production";
const origin = "https://shop.example";
async function connect(order: string, token?: string, from = origin) {
  return worker.fetch(new Request(`${origin}/api/v1/orders/${order}/live`, { headers: {
    Upgrade: "websocket", Origin: from,
    ...(token ? { Cookie: `${PAYMENT_LIVE_COOKIE}=${token}` } : {}),
  } }), env);
}
function nextMessage(socket: WebSocket) {
  return new Promise<string>((resolve) => socket.addEventListener("message", (event) => resolve(String(event.data)), { once: true }));
}

describe("authenticated payment push", () => {
  it("pushes callback updates only to the correct order, without polling", async () => {
    const a = `TT-${crypto.randomUUID()}`, b = `TT-${crypto.randomUUID()}`;
    const first = await connect(a, await createPaymentLiveToken(a, secret));
    const second = await connect(b, await createPaymentLiveToken(b, secret));
    expect(first.status).toBe(101);
    const wsA = first.webSocket!, wsB = second.webSocket!;
    const readyA = nextMessage(wsA), readyB = nextMessage(wsB);
    wsA.accept(); wsB.accept();
    expect(JSON.parse(await readyA)).toEqual({ type: "ready" });
    expect(JSON.parse(await readyB)).toEqual({ type: "ready" });
    const receivedB: string[] = [];
    wsB.addEventListener("message", (event) => { receivedB.push(String(event.data)); });
    const updateA = nextMessage(wsA);
    await env.ORDER_PAYMENT_UPDATES.getByName(a).notify("callback-cancelled");
    expect(JSON.parse(await updateA)).toEqual({ type: "payment.updated", eventId: "callback-cancelled" });
    const updateB = nextMessage(wsB);
    await env.ORDER_PAYMENT_UPDATES.getByName(b).notify("callback-paid");
    await updateB;
    expect(receivedB).toEqual([JSON.stringify({ type: "payment.updated", eventId: "callback-paid" })]);
    wsA.close(); wsB.close();
  });

  it("rejects missing, tampered, expired and cross-order authorization", async () => {
    const token = await createPaymentLiveToken("TT-A", secret);
    const expired = await new SignJWT({}).setProtectedHeader({ alg: "HS256" })
      .setIssuer("tipsy-payment-live").setAudience("TT-A").setSubject("TT-A")
      .setExpirationTime(1).sign(new TextEncoder().encode(secret));
    for (const invalid of [undefined, token + "x", expired]) expect((await connect("TT-A", invalid)).status).toBe(401);
    expect((await connect("TT-B", token)).status).toBe(401);
    expect((await connect("TT-A", token, "https://attacker.example")).status).toBe(403);
  });

  it("updates every authenticated tab for an order", async () => {
    const order = `TT-${crypto.randomUUID()}`;
    const token = await createPaymentLiveToken(order, secret);
    const sockets: WebSocket[] = [];
    for (let index = 0; index < 2; index++) {
      const response = await connect(order, token);
      const socket = response.webSocket!;
      const ready = nextMessage(socket);
      socket.accept(); await ready;
      sockets.push(socket);
    }
    const updates = sockets.map(nextMessage);
    await env.ORDER_PAYMENT_UPDATES.getByName(order).notify("paid");
    expect((await Promise.all(updates)).map((message) => JSON.parse(message).eventId)).toEqual(["paid", "paid"]);
    sockets.forEach((socket) => socket.close());
  });

  it("supports reconnect and hibernation heartbeat without a status query", async () => {
    const order = `TT-${crypto.randomUUID()}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await connect(order, await createPaymentLiveToken(order, secret));
      const socket = response.webSocket!;
      const ready = nextMessage(socket);
      socket.accept(); await ready;
      const pong = nextMessage(socket);
      socket.send("ping"); expect(await pong).toBe("pong");
      const update = nextMessage(socket);
      await env.ORDER_PAYMENT_UPDATES.getByName(order).notify(`event-${attempt}`);
      expect(JSON.parse(await update).eventId).toBe(`event-${attempt}`);
      socket.close();
    }
  });
});
