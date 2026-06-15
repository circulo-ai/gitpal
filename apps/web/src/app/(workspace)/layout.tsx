import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { WorkspaceShell } from "@/components/workspace-shell";
import { getServerAuthSession } from "@/lib/auth-session";

export default async function WorkspaceLayout({
	children,
}: {
	children: ReactNode;
}) {
	const session = await getServerAuthSession(await headers());

	if (!session?.user) {
		redirect("/login");
	}

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
