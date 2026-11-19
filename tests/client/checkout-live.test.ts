import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeToPaymentUpdates } from "../../src/lib/checkout-live";

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1;
  onopen?: () => void;
  onclose?: () => void;
  onerror?: () => void;
  onmessage?: (event: { data: string }) => void;
  send = vi.fn();
  constructor(public url: URL) { Socket.instances.push(this); }
  close() { this.onclose?.(); }
  message(type: string) { this.onmessage?.({ data: JSON.stringify({ type }) }); }
}
let stop: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers(); Socket.instances = [];
  vi.stubGlobal("location", { origin: "https://shop.example" });
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200,
    json: async () => ({ data: { webSocketPath: "/api/v1/orders/TT-1/live" } }) })));
});
afterEach(() => { stop?.(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const settle = async () => { await vi.advanceTimersByTimeAsync(0); };

describe("checkout live recovery", () => {
  it("reads on ready and callback events, with no timed order polling", async () => {
    const update = vi.fn(async () => {});
    stop = subscribeToPaymentUpdates({ orderNumber: "TT-1", accessToken: "private-token", onUpdate: update });
    await settle();
    const socket = Socket.instances[0];
    socket.onopen?.();
    expect(socket.url.href).toBe("wss://shop.example/api/v1/orders/TT-1/live");
    socket.message("ready"); await settle();
    expect(update).toHaveBeenCalledTimes(1);
    for (let tick = 0; tick < 6; tick++) {
      socket.onmessage?.({ data: "pong" });
      await vi.advanceTimersByTimeAsync(20_000);
    }
    expect(update).toHaveBeenCalledTimes(1);
    socket.message("payment.updated"); await settle();
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("reconnects and reads current state when a connection drops", async () => {
    const update = vi.fn(async () => {});
    stop = subscribeToPaymentUpdates({ orderNumber: "TT-1", accessToken: "token", onUpdate: update });
    await settle(); Socket.instances[0].close();
    await vi.advanceTimersByTimeAsync(500);
    expect(Socket.instances).toHaveLength(2);
    Socket.instances[1].message("ready"); await settle();
    expect(update).toHaveBeenCalledOnce();
    stop(); await vi.advanceTimersByTimeAsync(120_000);
    expect(Socket.instances).toHaveLength(2);
  });

  it("does not lose an update arriving during the initial snapshot read", async () => {
    let finish!: () => void;
    const update = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }))
      .mockResolvedValue(undefined);
    stop = subscribeToPaymentUpdates({ orderNumber: "TT-1", accessToken: "token", onUpdate: update });
    await settle();
    Socket.instances[0].message("ready");
    Socket.instances[0].message("payment.updated");
    expect(update).toHaveBeenCalledTimes(1);
    finish(); await settle();
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("recovers a failed snapshot even when no further callbacks arrive", async () => {
    const update = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    stop = subscribeToPaymentUpdates({ orderNumber: "TT-1", accessToken: "token", onUpdate: update });
    await settle(); Socket.instances[0].message("ready"); await settle();
    await vi.advanceTimersByTimeAsync(500);
    Socket.instances[1].message("ready"); await settle();
    expect(update).toHaveBeenCalledTimes(2);
  });
});
