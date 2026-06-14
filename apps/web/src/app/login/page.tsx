import AuthPage from "@/components/auth-page";

export default function LoginPage() {
	return (
		<AuthPage
			availability={{
				github: {
					cloud: Boolean(
						process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
					),
					enterprise: true,
				},
				gitlab: {
					cloud: Boolean(
						process.env.GITLAB_CLIENT_ID && process.env.GITLAB_CLIENT_SECRET,
					),
					enterprise: true,
				},
			}}
		/>
	);
}
