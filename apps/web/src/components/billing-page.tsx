"use client";

import { Badge } from "@gitpal/ui/components/badge";
import { Button } from "@gitpal/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@gitpal/ui/components/card";
import { Input } from "@gitpal/ui/components/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@gitpal/ui/components/table";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@gitpal/ui/components/tooltip";
import { useMutation, useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ArrowUpRightIcon, InfoIcon, WalletIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { queryClient, trpc } from "@/utils/trpc";

function formatUsd(cents: number) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
	}).format(cents / 100);
}

const presetAmounts = [25, 50, 100, 250];

export function BillingPage() {
	const summaryQuery = useQuery(trpc.billing.summary.queryOptions());
	const [amountUsd, setAmountUsd] = React.useState("50");
	const createTopupMutation = useMutation(
		trpc.billing.createTopup.mutationOptions({
			onSuccess: async (data) => {
				await queryClient.invalidateQueries({
					queryKey: trpc.billing.summary.queryKey(),
				});
				window.open(data.invoiceUrl, "_blank", "noopener,noreferrer");
				toast.success("Crypto checkout opened in a new tab.");
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const summary = summaryQuery.data;
	const cloudBillingLabel = summary?.cloudBillingEnabled
		? "Cloud billing"
		: "Self-hosted";
	const numericAmount = Number(amountUsd);
	const amountCents = Number.isFinite(numericAmount)
		? Math.round(numericAmount * 100)
		: 0;
	const estimatedFeeCents = summary
		? Math.round(amountCents * (summary.revenueSharePercent / 100))
		: 0;
	const estimatedCreditCents = Math.max(0, amountCents - estimatedFeeCents);
	const checkoutEnabled = summary?.checkoutEnabled ?? false;
	const checkoutDisabledReason =
		summary?.checkoutDisabledReason ??
		"Wallet top-ups are not available right now.";

	return (
		<TooltipProvider>
			<main className="flex flex-col gap-6">
				<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
					<div className="space-y-1">
						<h1 className="font-heading font-medium text-2xl tracking-tight md:text-3xl">
							Billing
						</h1>
						<p className="max-w-3xl text-muted-foreground text-sm">
							Each user has a USD wallet. Top up with crypto, keep the credited
							balance for agent usage, and only pay from the wallet when GitPal
							routes requests through our gateway.
						</p>
					</div>
					<Badge variant="outline">{cloudBillingLabel}</Badge>
				</div>

				<div className="grid gap-3 md:grid-cols-4">
					<Card size="sm">
						<CardHeader>
							<CardDescription>Available balance</CardDescription>
							<CardTitle className="text-3xl tabular-nums">
								{summary ? formatUsd(summary.availableBalanceCents) : "$0.00"}
							</CardTitle>
						</CardHeader>
					</Card>
					<Card size="sm">
						<CardHeader>
							<CardDescription>Total credited</CardDescription>
							<CardTitle className="text-3xl tabular-nums">
								{summary ? formatUsd(summary.totalCreditedCents) : "$0.00"}
							</CardTitle>
						</CardHeader>
					</Card>
					<Card size="sm">
						<CardHeader>
							<CardDescription>Total spent</CardDescription>
							<CardTitle className="text-3xl tabular-nums">
								{summary ? formatUsd(summary.totalSpentCents) : "$0.00"}
							</CardTitle>
						</CardHeader>
					</Card>
					<Card size="sm">
						<CardHeader>
							<CardDescription>Platform share</CardDescription>
							<CardTitle className="text-3xl tabular-nums">
								{summary ? `${summary.revenueSharePercent}%` : "5%"}
							</CardTitle>
						</CardHeader>
					</Card>
				</div>

				<div className="grid gap-6 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
					<Card>
						<CardHeader>
							<CardTitle>Top up wallet</CardTitle>
							<CardDescription>
								Create a NOWPayments checkout link, complete the payment, and
								the credited USD balance will appear after the webhook confirms
								it.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-5">
							<div className="grid grid-cols-2 gap-2">
								{presetAmounts.map((preset) => (
									<Button
										key={preset}
										type="button"
										variant={
											amountUsd === String(preset) ? "default" : "outline"
										}
										onClick={() => setAmountUsd(String(preset))}
									>
										{formatUsd(preset * 100)}
									</Button>
								))}
							</div>
							<div className="space-y-2">
								<div className="font-medium text-sm">Amount (USD)</div>
								<Input
									value={amountUsd}
									onChange={(event) => setAmountUsd(event.target.value)}
									type="number"
									min="5"
									step="0.01"
									inputMode="decimal"
									placeholder="50"
								/>
							</div>
							<div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
								<div className="flex items-center gap-2 font-medium text-sm">
									Estimated credit
									<Tooltip>
										<TooltipTrigger>
											<InfoIcon className="size-4 text-muted-foreground" />
										</TooltipTrigger>
										<TooltipContent>
											GitPal keeps {summary?.revenueSharePercent ?? 5}% of each
											top-up as platform revenue. The rest lands in your wallet.
										</TooltipContent>
									</Tooltip>
								</div>
								<div className="mt-3 flex items-end justify-between gap-4">
									<div>
										<div className="font-heading text-3xl">
											{formatUsd(estimatedCreditCents)}
										</div>
										<div className="mt-1 text-muted-foreground text-sm">
											Fee: {formatUsd(estimatedFeeCents)}
										</div>
									</div>
									<Button
										type="button"
										disabled={
											createTopupMutation.isPending ||
											!checkoutEnabled ||
											!Number.isFinite(numericAmount) ||
											numericAmount < 5
										}
										onClick={() =>
											createTopupMutation.mutate({
												amountUsd: numericAmount,
											})
										}
									>
										<ArrowUpRightIcon />
										{createTopupMutation.isPending
											? "Opening checkout..."
											: checkoutEnabled
												? "Continue to checkout"
												: "Checkout unavailable"}
									</Button>
								</div>
							</div>
							{!checkoutEnabled ? (
								<div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-950 text-sm dark:text-amber-100">
									{checkoutDisabledReason}
								</div>
							) : null}
							<div className="rounded-2xl border border-border/60 border-dashed p-4 text-muted-foreground text-sm">
								Crypto checkout happens on NOWPayments. GitPal records the
								deposit, deducts the configured platform share, and credits the
								rest to your USD wallet after the payment is finalized.
							</div>
						</CardContent>
					</Card>

					<div className="space-y-6">
						<Card>
							<CardHeader>
								<CardTitle>Recent top-ups</CardTitle>
								<CardDescription>
									Track invoice creation and settlement status.
								</CardDescription>
							</CardHeader>
							<CardContent>
								{summary?.recentTopups.length ? (
									<div className="overflow-x-auto rounded-2xl border border-border/60">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>Status</TableHead>
													<TableHead>Gross</TableHead>
													<TableHead>Net credit</TableHead>
													<TableHead>Created</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{summary.recentTopups.map((topup) => (
													<TableRow key={topup.id}>
														<TableCell>
															<div className="flex items-center gap-2">
																<Badge variant="outline">{topup.status}</Badge>
																{topup.invoiceUrl ? (
																	<a
																		href={topup.invoiceUrl}
																		target="_blank"
																		rel="noreferrer noopener"
																		className="text-muted-foreground hover:text-foreground"
																	>
																		<ArrowUpRightIcon className="size-4" />
																	</a>
																) : null}
															</div>
														</TableCell>
														<TableCell>
															{formatUsd(topup.priceAmountUsdCents)}
														</TableCell>
														<TableCell>
															{formatUsd(topup.creditedAmountCents)}
														</TableCell>
														<TableCell>
															{formatDistanceToNow(new Date(topup.createdAt), {
																addSuffix: true,
															})}
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</div>
								) : (
									<div className="rounded-2xl border border-border/60 border-dashed p-6 text-muted-foreground text-sm">
										No top-ups yet.
									</div>
								)}
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Wallet ledger</CardTitle>
								<CardDescription>
									Every wallet credit, fee, and usage debit is recorded here.
								</CardDescription>
							</CardHeader>
							<CardContent>
								{summary?.recentEntries.length ? (
									<div className="space-y-3">
										{summary.recentEntries.map((entry) => (
											<div
												key={entry.id}
												className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3"
											>
												<div className="min-w-0">
													<div className="flex items-center gap-2">
														<WalletIcon className="size-4 text-muted-foreground" />
														<div className="truncate font-medium">
															{entry.description}
														</div>
													</div>
													<div className="mt-1 text-muted-foreground text-xs">
														{formatDistanceToNow(new Date(entry.createdAt), {
															addSuffix: true,
														})}
													</div>
												</div>
												<div className="text-right">
													<div
														className={
															entry.amountCents >= 0
																? "font-medium text-emerald-600"
																: "font-medium text-amber-600"
														}
													>
														{entry.amountCents >= 0 ? "+" : "-"}
														{formatUsd(Math.abs(entry.amountCents))}
													</div>
													<div className="text-muted-foreground text-xs">
														Balance {formatUsd(entry.balanceAfterCents)}
													</div>
												</div>
											</div>
										))}
									</div>
								) : (
									<div className="rounded-2xl border border-border/60 border-dashed p-6 text-muted-foreground text-sm">
										No wallet activity yet.
									</div>
								)}
							</CardContent>
						</Card>
					</div>
				</div>
			</main>
		</TooltipProvider>
	);
}
