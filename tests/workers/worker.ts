import { upgradePaymentConnection } from "../../src/server/payment-live-upgrade";
export { OrderPaymentUpdates } from "../../src/payment-updates";

const worker = {
  fetch(request: Request, env: CloudflareEnv) {
    const order = new URL(request.url).pathname.split("/").at(-2) ?? "";
    return upgradePaymentConnection(request, order, env.ORDER_PAYMENT_UPDATES,
      "test-only-session-secret-never-used-in-production");
  },
};
export default worker;
