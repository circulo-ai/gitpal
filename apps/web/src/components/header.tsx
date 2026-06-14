"use client";

import { cn } from "@gitpal/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { GitPalMark } from "./gitpal-mark";
import UserMenu from "./user-menu";

const homeLinks = [
	{ to: "/#product", label: "Product" },
	{ to: "/#platforms", label: "Platforms" },
	{ to: "/#security", label: "Security" },
	{ to: "/#workflow", label: "Workflow" },
] as const;

const appLinks = [
	{ to: "/", label: "Home" },
	{ to: "/dashboard", label: "Dashboard" },
] as const;

export default function Header() {
	const pathname = usePathname();
	const links = pathname === "/" ? homeLinks : appLinks;

	return (
		<header className="sticky top-0 z-50 border-border/70 border-b bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
			<div className="mx-auto flex h-18 max-w-[1440px] items-center gap-4 px-4 sm:px-6 lg:px-8">
				<Link href="/" className="flex items-center gap-3">
					<GitPalMark className="size-9 text-[0.72rem]" />
					<div className="flex flex-col">
						<span className="font-semibold text-[0.98rem] text-foreground tracking-[-0.03em]">
							GitPal
						</span>
						<span className="text-[11px] text-muted-foreground leading-none">
							Open source code review
						</span>
					</div>
				</Link>

				<nav className="hidden items-center gap-1 md:flex">
					{links.map((link) => (
						<a
							key={link.to}
							href={link.to}
							className={cn(
								"rounded-full px-3 py-2 text-muted-foreground text-sm transition hover:bg-muted hover:text-foreground",
							)}
						>
							{link.label}
						</a>
					))}
				</nav>

				<div className="ml-auto flex items-center gap-2">
					<UserMenu />
				</div>
			</div>
		</header>
	);
}
