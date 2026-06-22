"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const AUTH_ROUTES = ["/login", "/signup"];
const WORKSPACE_ROUTES = [
	"/dashboard",
	"/repositories",
	"/observability",
	"/integrations",
	"/notifications",
	"/account",
];

export default function AppShell({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));
	const isWorkspaceRoute = WORKSPACE_ROUTES.some((route) =>
		pathname.startsWith(route),
	);
	const isLandingPage = pathname === "/";

	if (isAuthRoute || isLandingPage || isWorkspaceRoute) {
		if (isWorkspaceRoute) {
			return (
				<div className="min-h-svh overflow-x-clip bg-background text-foreground">
					{children}
				</div>
			);
		}

		return <>{children}</>;
	}

	return (
		<div className="min-h-svh overflow-x-clip bg-background text-foreground">
			<div className="grid min-h-svh grid-rows-[auto_1fr]">{children}</div>
		</div>
	);
}
