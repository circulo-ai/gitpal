import { ssoClient } from "@better-auth/sso/client";
import { env } from "@gitpal/env/web";
import { genericOAuthClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_SERVER_URL,
  plugins: [
    genericOAuthClient(),
    ssoClient({
      domainVerification: {
        enabled: true,
      },
    }),
  ],
});

type OAuthSignInInput = {
  providerId: string;
  label: string;
  callbackURL?: string;
};

type WorkEmailSsoSignInInput = {
  email: string;
  label: string;
  callbackURL?: string;
};

type EnterpriseGitHostSignInInput = {
  type: "github" | "gitlab";
  baseUrl: string;
  label: string;
  callbackURL?: string;
  errorCallbackURL?: string;
  newUserCallbackURL?: string;
  requestSignUp?: boolean;
  scopes?: string[];
};

type EnterpriseGitHostSignInResponse = {
  url?: string;
  redirect?: boolean;
  message?: string;
};

function getSignInErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}

export async function startOAuthSignIn({
  providerId,
  label,
  callbackURL = "/dashboard",
}: OAuthSignInInput) {
  const { data, error } = await authClient.signIn.oauth2({
    providerId,
    callbackURL,
    disableRedirect: true,
  });

  if (error) {
    throw new Error(
      getSignInErrorMessage(error, `Unable to start ${label} sign in.`),
    );
  }

  if (!data?.url) {
    throw new Error(`Unable to start ${label} sign in.`);
  }

  window.location.assign(data.url);
}

export async function startWorkEmailSsoSignIn({
  email,
  label,
  callbackURL = "/dashboard",
}: WorkEmailSsoSignInInput) {
  const result = (await authClient.signIn.sso({
    email,
    callbackURL,
    loginHint: email,
  })) as
    | {
        data?: {
          url?: string;
        };
        error?: unknown;
      }
    | undefined;

  if (result?.error) {
    throw new Error(
      getSignInErrorMessage(result.error, `Unable to start ${label} sign in.`),
    );
  }

  if (result?.data?.url) {
    window.location.assign(result.data.url);
  }
}

export async function startEnterpriseGitHostSignIn({
  type,
  baseUrl,
  label,
  callbackURL = "/dashboard",
  errorCallbackURL,
  newUserCallbackURL,
  requestSignUp,
  scopes,
}: EnterpriseGitHostSignInInput) {
  const response = await fetch(
    `${env.NEXT_PUBLIC_SERVER_URL}/api/auth/sign-in/enterprise-git-host`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type,
        baseUrl,
        callbackURL,
        errorCallbackURL,
        newUserCallbackURL,
        requestSignUp,
        scopes,
        disableRedirect: true,
      }),
    },
  );

  const data = (await response
    .json()
    .catch(() => null)) as EnterpriseGitHostSignInResponse | null;

  if (!response.ok) {
    throw new Error(
      getSignInErrorMessage(data?.message, `Unable to start ${label} sign in.`),
    );
  }

  if (!data?.url) {
    throw new Error(`Unable to start ${label} sign in.`);
  }

  window.location.assign(data.url);
}
