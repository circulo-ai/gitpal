"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import Header from "./header";

const AUTH_ROUTES = ["/login", "/signup"];

export default function AppShell({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));
	const isLandingPage = pathname === "/";

	if (isAuthRoute || isLandingPage) {
		return <>{children}</>;
	}

	return (
		<div className="min-h-svh overflow-x-clip bg-background text-foreground">
			<div className="grid min-h-svh grid-rows-[auto_1fr]">
				<Header />
				{children}
			</div>
		</div>
	);
}
