import { workspaceAc, workspaceRoles } from "@gitpal/auth/organization-access";
import { apiKeyClient } from "@better-auth/api-key/client";
import { ssoClient } from "@better-auth/sso/client";
import { env } from "@gitpal/env/web";
import {
  genericOAuthClient,
  organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_SERVER_URL,
  fetchOptions: {
    credentials: "include",
  },
  plugins: [
    apiKeyClient(),
    genericOAuthClient(),
    organizationClient({
      ac: workspaceAc,
      roles: workspaceRoles,
      teams: {
        enabled: true,
      },
      dynamicAccessControl: {
        enabled: true,
      },
    }),
    ssoClient({
      domainVerification: {
        enabled: true,
      },
    }),
  ],
});

const DEFAULT_CALLBACK_PATH = "/dashboard";

function resolveFrontendCallbackURL(callbackURL: string) {
  if (typeof window === "undefined") {
    return callbackURL;
  }

  return new URL(callbackURL, window.location.origin).toString();
}

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
  callbackURL = DEFAULT_CALLBACK_PATH,
}: OAuthSignInInput) {
  const resolvedCallbackURL = resolveFrontendCallbackURL(callbackURL);

  const { data, error } = await authClient.signIn.oauth2({
    providerId,
    callbackURL: resolvedCallbackURL,
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
  callbackURL = DEFAULT_CALLBACK_PATH,
}: WorkEmailSsoSignInInput) {
  const resolvedCallbackURL = resolveFrontendCallbackURL(callbackURL);

  const result = (await authClient.signIn.sso({
    email,
    callbackURL: resolvedCallbackURL,
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
  callbackURL = DEFAULT_CALLBACK_PATH,
  errorCallbackURL,
  newUserCallbackURL,
  requestSignUp,
  scopes,
}: EnterpriseGitHostSignInInput) {
  const resolvedCallbackURL = resolveFrontendCallbackURL(callbackURL);
  const resolvedErrorCallbackURL = errorCallbackURL
    ? resolveFrontendCallbackURL(errorCallbackURL)
    : undefined;
  const resolvedNewUserCallbackURL = newUserCallbackURL
    ? resolveFrontendCallbackURL(newUserCallbackURL)
    : undefined;

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
        callbackURL: resolvedCallbackURL,
        errorCallbackURL: resolvedErrorCallbackURL,
        newUserCallbackURL: resolvedNewUserCallbackURL,
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
