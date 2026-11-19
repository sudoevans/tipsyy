interface PaymentSubscription {
  orderNumber: string;
  accessToken: string;
  onUpdate: () => Promise<void>;
}

// Reconnect timers and heartbeat frames keep the transport healthy. Neither
// queries the order or M-Pesa; snapshots are read only on ready/update events.
export function subscribeToPaymentUpdates({ orderNumber, accessToken, onUpdate }: PaymentSubscription) {
  let stopped = false;
  let socket: WebSocket | undefined;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let handshake: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  let lastMessageAt = 0;
  let refreshRunning = false;
  let refreshAgain = false;
  const controller = new AbortController();

  // If an update arrives while a snapshot is loading, read again afterwards.
  // Dropping that event could leave a pre-callback snapshot on screen.
  const refresh = async () => {
    if (stopped) return;
    if (refreshRunning) { refreshAgain = true; return; }
    refreshRunning = true;
    try {
      do {
        refreshAgain = false;
        await onUpdate();
      } while (!stopped && refreshAgain);
    } catch {
      // A failed snapshot must reconnect and re-read even if no more events arrive.
      socket?.close();
    } finally { refreshRunning = false; }
  };
  const scheduleReconnect = () => {
    if (handshake) clearTimeout(handshake);
    if (heartbeat) clearInterval(heartbeat);
    if (stopped || reconnect) return;
    const delay = Math.min(10_000, 500 * 2 ** Math.min(failures++, 5));
    reconnect = setTimeout(() => { reconnect = undefined; void connect(); }, delay);
  };
  const connect = async () => {
    try {
      const response = await fetch(`/api/v1/orders/${encodeURIComponent(orderNumber)}/events`, {
        headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
      });
      if (stopped) return;
      if (response.status === 401 || response.status === 404) {
        await refresh();
        stopped = true;
        return;
      }
      if (!response.ok) throw new Error("Live updates unavailable.");
      const payload = await response.json() as { data: { webSocketPath: string } };
      if (stopped) return;
      const url = new URL(payload.data.webSocketPath, location.origin);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const connection = new WebSocket(url);
      socket = connection;
      handshake = setTimeout(() => connection.close(), 10_000);
      connection.onmessage = (event) => {
        if (stopped) return;
        lastMessageAt = Date.now();
        if (event.data === "pong") return;
        try {
          const message = JSON.parse(event.data) as { type: string };
          if (message.type === "ready") {
            failures = 0;
            void refresh();
          } else if (message.type === "payment.updated") void refresh();
        } catch { /* Ignore unrecognized messages. */ }
      };
      connection.onopen = () => {
        if (handshake) clearTimeout(handshake);
        lastMessageAt = Date.now();
        heartbeat = setInterval(() => {
          if (Date.now() - lastMessageAt > 45_000) connection.close();
          else if (connection.readyState === WebSocket.OPEN) connection.send("ping");
        }, 20_000);
      };
      connection.onclose = scheduleReconnect;
      connection.onerror = () => connection.close();
    } catch {
      scheduleReconnect();
    }
  };
  void connect();
  return () => {
    stopped = true;
    controller.abort();
    if (reconnect) clearTimeout(reconnect);
    if (heartbeat) clearInterval(heartbeat);
    if (handshake) clearTimeout(handshake);
    socket?.close();
  };
}
