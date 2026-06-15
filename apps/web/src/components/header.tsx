"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { GitPalMark } from "./gitpal-mark";
import UserMenu from "./user-menu";

const homeLinks = [
	{ href: "#security", label: "Security" },
	{ href: "#features", label: "Features" },
	{ href: "#workflow", label: "Workflow" },
] as const;

export default function Header() {
	const pathname = usePathname();
	const isHomePage = pathname === "/";

	return (
		<header className="sticky top-0 z-50 border-border/60 border-b bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
			<div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
				<Link href="/" className="flex items-center gap-3">
					<GitPalMark className="size-8 text-[0.68rem]" />
					<div className="flex flex-col">
						<span className="font-semibold text-[1rem] text-foreground tracking-[-0.03em]">
							GitPal
						</span>
					</div>
				</Link>

				{isHomePage ? (
					<nav className="hidden items-center gap-1 md:flex">
						{homeLinks.map((link) => (
							<a
								key={link.href}
								href={link.href}
								className="rounded-full px-4 py-2 font-medium text-muted-foreground text-sm transition hover:bg-muted hover:text-foreground"
							>
								{link.label}
							</a>
						))}
					</nav>
				) : null}

				<div className="ml-auto flex items-center gap-3">
					<UserMenu />
				</div>
			</div>
		</header>
	);
}
