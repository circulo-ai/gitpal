export const dynamic = "force-dynamic";

import AuthPage from "@/components/auth-page";
import { env } from "@gitpal/env/web-server";

export default function LoginPage() {
  return (
    <AuthPage
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
