import { env } from "@gitpal/env/web-server";
import { notFound } from "next/navigation";
import { BillingPage } from "@/components/billing-page";

export default function BillingRoute() {
	if (!env.NEXT_PUBLIC_GITPAL_CLOUD_BILLING_ENABLED) {
		notFound();
	}

	return <BillingPage />;
}
