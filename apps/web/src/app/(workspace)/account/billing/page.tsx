import { Badge } from "@gitpal/ui/components/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@gitpal/ui/components/card";

export default function BillingRoute() {
	return (
		<main className="flex min-h-0 flex-1 flex-col gap-6">
			<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
				<div className="space-y-1">
					<h1 className="font-heading text-2xl font-medium tracking-tight md:text-3xl">
						Billing
					</h1>
					<p className="max-w-3xl text-muted-foreground text-sm">
						GitPal is pay-as-you-go. Subscription tiers are intentionally not
						used here.
					</p>
				</div>
				<Badge variant="outline">Crypto later</Badge>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Usage-based billing</CardTitle>
					<CardDescription>
						We are not adding subscription plans. Future payment rails will be
						pay-as-you-go with a crypto gateway.
					</CardDescription>
				</CardHeader>
				<CardContent className="text-sm text-muted-foreground">
					This area is ready for future balance, invoices, and transaction
					history wiring once the payment flow exists.
				</CardContent>
			</Card>
		</main>
	);
}
