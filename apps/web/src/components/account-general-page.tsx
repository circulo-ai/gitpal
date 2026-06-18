"use client";

import { Badge } from "@gitpal/ui/components/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@gitpal/ui/components/card";
import { useQuery } from "@tanstack/react-query";

import { trpc } from "@/utils/trpc";

import { useActiveWorkspace } from "./active-workspace-provider";
import { OrganizationSettingsPanel } from "./organization-settings-panel";

export function AccountGeneralPage() {
  const { activeWorkspace, workspaces } = useActiveWorkspace();
  const providersQuery = useQuery(trpc.repositories.providers.queryOptions());
  const providers = providersQuery.data ?? [];

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-medium tracking-tight md:text-3xl">
            Account
          </h1>
          <p className="max-w-3xl text-muted-foreground text-sm">
            Control workspace defaults, review how provider access is mapped,
            and jump into wallet or key management without leaving the account
            area.
          </p>
        </div>
        <Badge variant="outline">
          {activeWorkspace
            ? `Active: ${activeWorkspace.name}`
            : "No active workspace"}
        </Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Workspaces</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {workspaces.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Connected providers</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {providers.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Active repositories</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {activeWorkspace?.repositoryCount ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
      <OrganizationSettingsPanel />
    </main>
  );
}
