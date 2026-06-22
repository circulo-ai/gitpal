"use client";

import { Button } from "@gitpal/ui/components/button";
import { GithubIcon, GitlabIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function InstallButtons({
	tone = "light",
	className,
}: {
	tone?: "light" | "dark";
	className?: string;
}) {
	return (
		<div className={cn("flex flex-col gap-3 sm:flex-row", className)}>
			<Button
				render={(props) => <Link {...props} href="/login" />}
				nativeButton={false}
				size="lg"
				className="rounded-xl px-5 text-[15px] transition-transform hover:-translate-y-0.5"
			>
				<HugeiconsIcon icon={GithubIcon} size={18} />
				Install on GitHub
			</Button>
			<Button
				render={(props) => <Link {...props} href="/login" />}
				size="lg"
				variant="outline"
				nativeButton={false}
				className={cn(
					"rounded-xl px-5 text-[15px] transition-transform hover:-translate-y-0.5",
					tone === "dark" &&
						"border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white",
				)}
			>
				<HugeiconsIcon icon={GitlabIcon} size={18} />
				Install on GitLab
			</Button>
		</div>
	);
}
