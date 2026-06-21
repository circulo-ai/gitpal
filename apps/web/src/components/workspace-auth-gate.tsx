"use client";

import { Skeleton } from "@gitpal/ui/components/skeleton";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { authClient } from "@/lib/auth-client";
import { WorkspaceShell } from "./workspace-shell";

function WorkspaceSessionLoading() {
	return (
		<div className="flex min-h-svh items-center justify-center bg-[#0b0910] px-4 text-white">
			<div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#151218]/95 p-6 shadow-2xl shadow-black/30 backdrop-blur">
				<div className="mb-6 flex items-center gap-3">
					<div className="flex size-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
						<HugeiconsIcon
							icon={Loading03Icon}
							size={20}
							className="animate-spin text-white/80"
						/>
					</div>
					<div className="space-y-1">
						<p className="font-medium text-white">Checking your session</p>
						<p className="text-sm text-white/58">
							GitPal is confirming your GitHub sign-in.
						</p>
					</div>
				</div>

				<div className="space-y-3">
					<Skeleton className="h-4 w-2/3 bg-white/10" />
					<Skeleton className="h-20 w-full rounded-2xl bg-white/10" />
					<Skeleton className="h-20 w-full rounded-2xl bg-white/10" />
				</div>
			</div>
		</div>
	);
}

type WorkspaceAuthGateProps = {
	children: ReactNode;
};

export function WorkspaceAuthGate({ children }: WorkspaceAuthGateProps) {
	const router = useRouter();
	const { data: session, isPending } = authClient.useSession();
	const user = session?.user ?? null;

	useEffect(() => {
		if (!isPending && !user) {
			router.replace("/login");
		}
	}, [isPending, router, user]);

	if (isPending) {
		return <WorkspaceSessionLoading />;
	}

	if (!user) {
		return <WorkspaceSessionLoading />;
	}

	return (
		<WorkspaceShell
			user={{
				name: user.name,
				email: user.email,
				image: user.image,
			}}
		>
			{children}
		</WorkspaceShell>
	);
}
