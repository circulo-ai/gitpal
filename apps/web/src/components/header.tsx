"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@gitpal/ui/lib/utils";

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
		<header className="sticky top-0 z-50 border-b border-white/10 bg-[#0b0910]/78 backdrop-blur-xl supports-[backdrop-filter]:bg-[#0b0910]/62">
			<div className="mx-auto flex h-18 max-w-[1440px] items-center gap-4 px-4 sm:px-6 lg:px-8">
				<Link href="/" className="flex items-center gap-3">
					<GitPalMark className="size-9 text-[0.72rem]" />
					<div className="flex flex-col">
						<span className="font-semibold text-[0.98rem] tracking-[-0.03em] text-white">
							GitPal
						</span>
						<span className="text-[11px] leading-none text-white/42">
							Open source AI review
						</span>
					</div>
				</Link>

				<nav className="hidden items-center gap-1 md:flex">
					{links.map((link) => (
						<a
							key={link.to}
							href={link.to}
							className={cn(
								"rounded-full px-3 py-2 text-sm text-white/62 transition hover:bg-white/5 hover:text-white",
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
