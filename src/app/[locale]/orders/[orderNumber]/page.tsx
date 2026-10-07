import CustomerOrderDetails from "@/components/storefront/CustomerOrderDetails";
export default async function OrderDetailsPage({ params }: { params: Promise<{ orderNumber: string }> }) { const { orderNumber } = await params; return <CustomerOrderDetails orderNumber={orderNumber} />; }
