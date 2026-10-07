const formatter = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 });

export function formatPrice(amount: number) {
  return `KSh ${formatter.format(amount)}`;
}
