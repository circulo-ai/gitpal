"use client";

import type { ReactNode } from "react";

import { Badge } from "@gitpal/ui/components/badge";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@gitpal/ui/components/card";
import { cn } from "@gitpal/ui/lib/utils";

type PageHeaderProps = {
	title: string;
	description?: ReactNode;
	eyebrow?: string;
	badges?: ReactNode;
	actions?: ReactNode;
	className?: string;
};

type PageStatCardProps = {
	label: string;
	value: ReactNode;
	meta?: ReactNode;
	className?: string;
};

type PageSectionCardProps = {
	title?: ReactNode;
	description?: ReactNode;
	action?: ReactNode;
	children: ReactNode;
	className?: string;
	contentClassName?: string;
};

export function PageHeader({
	title,
	description,
	eyebrow,
	badges,
	actions,
	className,
}: PageHeaderProps) {
	return (
		<section
			className={cn(
				"rounded-3xl border border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] p-6 shadow-sm md:p-7",
				className,
			)}
		>
			<div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
				<div className="max-w-3xl space-y-3">
					{eyebrow ? (
						<Badge variant="outline" className="w-fit rounded-full px-3">
							{eyebrow}
						</Badge>
					) : null}
					<div className="space-y-2">
						<h1 className="font-heading font-medium text-3xl tracking-tight md:text-4xl">
							{title}
						</h1>
						{description ? (
							<p className="max-w-3xl text-muted-foreground text-sm leading-6 md:text-base">
								{description}
							</p>
						) : null}
					</div>
				</div>
				<div className="flex flex-col items-start gap-3 xl:items-end">
					{badges ? <div className="flex flex-wrap gap-2">{badges}</div> : null}
					{actions ? (
						<div className="flex w-full flex-wrap gap-2 xl:w-auto xl:justify-end">
							{actions}
						</div>
					) : null}
				</div>
			</div>
		</section>
	);
}

export function PageStatGrid({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("grid gap-3 md:grid-cols-2 xl:grid-cols-4", className)}>
			{children}
		</div>
	);
}

export function PageStatCard({
	label,
	value,
	meta,
	className,
}: PageStatCardProps) {
	return (
		<Card
			size="sm"
			className={cn(
				"border-border/60 bg-card/85 shadow-sm backdrop-blur-sm",
				className,
			)}
		>
			<CardHeader className="gap-3">
				<CardDescription>{label}</CardDescription>
				<CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
				{meta ? (
					<div className="text-muted-foreground text-xs leading-5">{meta}</div>
				) : null}
			</CardHeader>
		</Card>
	);
}

export function PageSectionCard({
	title,
	description,
	action,
	children,
	className,
	contentClassName,
}: PageSectionCardProps) {
	return (
		<Card className={cn("border-border/60 shadow-sm", className)}>
			{title || description || action ? (
				<CardHeader className="gap-3 md:flex-row md:items-start md:justify-between">
					<div className="space-y-1.5">
						{title ? <CardTitle>{title}</CardTitle> : null}
						{description ? <CardDescription>{description}</CardDescription> : null}
					</div>
					{action ? <CardAction>{action}</CardAction> : null}
				</CardHeader>
			) : null}
			<CardContent className={contentClassName}>{children}</CardContent>
		</Card>
	);
}
