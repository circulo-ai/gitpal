"use client";

import * as React from "react";
import { Badge } from "@gitpal/ui/components/badge";
import { Button } from "@gitpal/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@gitpal/ui/components/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@gitpal/ui/components/empty";
import { Input } from "@gitpal/ui/components/input";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

import { OrganizationSettingsPanel } from "./organization-settings-panel";

function slugify(value: string) {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function getAuthErrorMessage(error: unknown, fallback: string) {
	if (typeof error === "string") {
		return error;
	}

	if (error && typeof error === "object" && "message" in error) {
		const message = (error as { message?: unknown }).message;

		if (typeof message === "string" && message.trim()) {
			return message;
		}
	}

	return fallback;
}

export function AccountGeneralPage() {
	const organizationsQuery = authClient.useListOrganizations();
	const activeOrganizationQuery = authClient.useActiveOrganization();
	const organizations = organizationsQuery.data ?? [];
	const activeOrganization = activeOrganizationQuery.data;
	const [name, setName] = React.useState("");
	const [slug, setSlug] = React.useState("");
	const [slugTouched, setSlugTouched] = React.useState(false);
	const [isCreating, startTransition] = React.useTransition();

	async function createOrganization() {
		const trimmedName = name.trim();
		const trimmedSlug = slug.trim() || slugify(trimmedName);

		if (!trimmedName || !trimmedSlug) {
			toast.error("Organization name and slug are required.");
			return;
		}

		startTransition(async () => {
			const result = await authClient.organization.create({
				name: trimmedName,
				slug: trimmedSlug,
				keepCurrentActiveOrganization: false,
			});

			if (result.error) {
				toast.error(
					getAuthErrorMessage(
						result.error,
						"Unable to create the organization.",
					),
				);
				return;
			}

			setName("");
			setSlug("");
			setSlugTouched(false);
			toast.success("Organization created.");
			window.location.reload();
		});
	}

	return (
		<main className="flex min-h-0 flex-1 flex-col gap-6">
			<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
				<div className="space-y-1">
					<h1 className="font-heading text-2xl font-medium tracking-tight md:text-3xl">
						Account
					</h1>
					<p className="max-w-3xl text-muted-foreground text-sm">
						Manage your organizations, shared review defaults, and the account
						pieces that sit around the rest of the workspace.
					</p>
				</div>
				<Badge variant="outline">
					{activeOrganization ? `Active: ${activeOrganization.name}` : "No active organization"}
				</Badge>
			</div>

			<div className="grid gap-6 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
				<Card>
					<CardHeader>
						<CardTitle>Create organization</CardTitle>
						<CardDescription>
							Start a new workspace and make it active for this session.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<div className="font-medium text-sm">Name</div>
							<Input
								value={name}
								disabled={isCreating}
								onChange={(event) => {
									const nextName = event.target.value;
									setName(nextName);
									if (!slugTouched) {
										setSlug(slugify(nextName));
									}
								}}
								placeholder="MonoBit"
							/>
						</div>
						<div className="space-y-2">
							<div className="font-medium text-sm">Slug</div>
							<Input
								value={slug}
								disabled={isCreating}
								onChange={(event) => {
									setSlugTouched(true);
									setSlug(slugify(event.target.value));
								}}
								placeholder="monobit"
							/>
							<p className="text-muted-foreground text-xs">
								Used in URLs and organization lookups.
							</p>
						</div>
						<Button
							type="button"
							disabled={isCreating}
							onClick={() => {
								void createOrganization();
							}}
						>
							{isCreating ? "Creating..." : "Create organization"}
						</Button>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Organizations</CardTitle>
						<CardDescription>
							Switch the active organization or jump into its defaults.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{organizations.length === 0 ? (
							<Empty className="min-h-64">
								<EmptyHeader>
									<EmptyTitle>No organizations yet</EmptyTitle>
									<EmptyDescription>
										Create your first organization to unlock the workspace
										settings and team features.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						) : (
							<div className="space-y-3">
								{organizations.map((organization) => {
									const isActive =
										activeOrganization?.id === organization.id;

									return (
										<button
											key={organization.id}
											type="button"
											onClick={async () => {
												const result =
													await authClient.organization.setActive({
														organizationId: organization.id,
													});

												if (result.error) {
													toast.error(
														getAuthErrorMessage(
															result.error,
															"Unable to switch organizations.",
														),
													);
													return;
												}

												toast.success(`Switched to ${organization.name}.`);
												window.location.reload();
											}}
											className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-left transition-colors hover:bg-muted/40"
										>
											<div className="min-w-0 space-y-1">
												<div className="truncate font-medium">
													{organization.name}
												</div>
												<div className="truncate text-muted-foreground text-sm">
													{organization.slug}
												</div>
											</div>
											<Badge variant={isActive ? "secondary" : "outline"}>
												{isActive ? "Active" : "Switch"}
											</Badge>
										</button>
									);
								})}
							</div>
						)}
					</CardContent>
				</Card>
			</div>

			<OrganizationSettingsPanel />
		</main>
	);
}
