import { DurableObject } from "cloudflare:workers";

// Only the authenticated Worker upgrade handler can reach this object.
// Each order has its own object. No customer details or bearer tokens are sent.
export class OrderPaymentUpdates extends DurableObject<CloudflareEnv> {
  constructor(ctx: DurableObjectState, env: CloudflareEnv) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  fetch(request: Request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required.", { status: 426 });
    }
    if (this.ctx.getWebSockets().length >= 10) {
      return new Response("Too many connections.", { status: 429 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    // Sent after registration: the client now reads the current DB snapshot.
    // This closes the race between initial page load and callback delivery.
    server.send(JSON.stringify({ type: "ready" }));
    return new Response(null, { status: 101, webSocket: client });
  }

  notify(eventId: string) {
    const message = JSON.stringify({ type: "payment.updated", eventId });
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(message); }
      catch { socket.close(1011, "Please reconnect."); }
    }
  }

  webSocketMessage(socket: WebSocket) {
    // This connection carries server updates only. Ping is handled in hibernation.
    socket.close(1008, "Unsupported message.");
  }

  webSocketClose(socket: WebSocket, code: number) {
    // 1005 means the peer sent an empty close frame; neither it nor 1006
    // may be echoed as an explicit wire close code.
    if (code === 1005 || code === 1006) socket.close();
    else socket.close(code);
  }
  webSocketError(socket: WebSocket) { socket.close(1011, "Please reconnect."); }
}
