import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getServerAuthSession } from "@/lib/auth-session";

export default async function DashboardPage() {
	const session = await getServerAuthSession(await headers());

	if (!session?.user) {
		redirect("/login");
	}

	return (
		<div>
			<h1>Dashboard</h1>
			<p>Welcome {session.user.name}</p>
		</div>
	);
}
