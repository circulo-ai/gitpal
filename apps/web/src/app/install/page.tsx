export const dynamic = "force-dynamic";

import { env } from "@gitpal/env/web-server";
import AuthPage from "@/components/auth-page";

export default function InstallPage() {
	return (
		<AuthPage
			mode="install"
			availability={{
				github: {
					cloud: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
					enterprise: true,
				},
				gitlab: {
					cloud: Boolean(env.GITLAB_CLIENT_ID && env.GITLAB_CLIENT_SECRET),
					enterprise: true,
				},
			}}
		/>
	);
}
