import { env } from "@gitpal/env/web-server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { WorkspaceAuthGate } from "@/components/workspace-auth-gate";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getServerAuthSession } from "@/lib/auth-session";

function getRequestHost(requestHeaders: Headers) {
	return (
		requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim() ??
		requestHeaders.get("host")
	);
}

function shouldUseClientAuthFallback(requestHeaders: Headers) {
	const requestHost = getRequestHost(requestHeaders);

	if (!requestHost) {
		return true;
	}

	const authHosts = [new URL(env.NEXT_PUBLIC_SERVER_URL).host];

	return !authHosts.includes(requestHost);
}

export default async function WorkspaceLayout({
	children,
}: {
	children: ReactNode;
}) {
	const requestHeaders = await headers();
	const session = await getServerAuthSession(requestHeaders);

	if (session?.user) {
		return (
			<WorkspaceShell
				user={{
					name: session.user.name,
					email: session.user.email,
					image: session.user.image,
				}}
			>
				{children}
			</WorkspaceShell>
		);
	}

	if (!shouldUseClientAuthFallback(requestHeaders)) {
		redirect("/login");
	}

	return <WorkspaceAuthGate>{children}</WorkspaceAuthGate>;
}
