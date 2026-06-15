"use client";

import * as React from "react";
import { Badge } from "@gitpal/ui/components/badge";
import { Button } from "@gitpal/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@gitpal/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@gitpal/ui/components/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@gitpal/ui/components/empty";
import { Input } from "@gitpal/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@gitpal/ui/components/select";
import { Skeleton } from "@gitpal/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@gitpal/ui/components/table";
import { Switch } from "@gitpal/ui/components/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  ExternalLinkIcon,
  FolderGit2Icon,
  PlusIcon,
  RefreshCcwIcon,
  SearchIcon,
  Settings2Icon,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { queryClient, trpc } from "@/utils/trpc";

function getFallback(name: string) {
  return name.split("/").at(-1)?.slice(0, 2).toUpperCase() ?? "GP";
}

function RepositorySkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  );
}

function searchRepository(
  repository: {
    fullName: string;
    name: string;
    repositoryPath: string;
    providerName: string;
    description: string | null;
  },
  query: string,
) {
  if (!query) {
    return true;
  }

  const haystack = [
    repository.fullName,
    repository.name,
    repository.repositoryPath,
    repository.providerName,
    repository.description ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

export function RepositoriesPage() {
  const activeOrganizationQuery = authClient.useActiveOrganization();
  const activeOrganization = activeOrganizationQuery.data;
  const repositoriesQuery = useQuery({
    ...trpc.repositories.list.queryOptions({
      organizationId: activeOrganization?.id,
    }),
    enabled: Boolean(activeOrganization),
  });
  const providersQuery = useQuery(trpc.repositories.providers.queryOptions());
  const [search, setSearch] = React.useState("");
  const [pageSize, setPageSize] = React.useState("10");
  const [page, setPage] = React.useState(0);
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [selectedProviderId, setSelectedProviderId] = React.useState("");
  const [repositoryPath, setRepositoryPath] = React.useState("");

  const syncMutation = useMutation(
    trpc.repositories.sync.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.repositories.list.queryKey({
            organizationId: activeOrganization?.id,
          }),
        });
        toast.success("Repository sync started.");
      },
    }),
  );

  const toggleMutation = useMutation(
    trpc.repositories.toggleEnabled.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.repositories.list.queryKey({
            organizationId: activeOrganization?.id,
          }),
        });
      },
    }),
  );

  const addMutation = useMutation(
    trpc.repositories.addRepository.mutationOptions({
      onSuccess: async () => {
        setRepositoryPath("");
        setIsAddOpen(false);
        await queryClient.invalidateQueries({
          queryKey: trpc.repositories.list.queryKey({
            organizationId: activeOrganization?.id,
          }),
        });
        toast.success("Repository added.");
      },
    }),
  );

  React.useEffect(() => {
    if (!selectedProviderId && providersQuery.data?.[0]?.providerId) {
      setSelectedProviderId(providersQuery.data[0].providerId);
    }
  }, [providersQuery.data, selectedProviderId]);

  React.useEffect(() => {
    setPage(0);
  }, [search, pageSize]);

  const repositories = repositoriesQuery.data ?? [];
  const providers = providersQuery.data ?? [];
  const normalizedSearch = search.trim().toLowerCase();
  const filteredRepositories = repositories.filter((repository) =>
    searchRepository(repository, normalizedSearch),
  );
  const pageSizeNumber = Number(pageSize) || 10;
  const pageCount = Math.max(
    1,
    Math.ceil(filteredRepositories.length / pageSizeNumber),
  );
  const visibleRepositories = filteredRepositories.slice(
    page * pageSizeNumber,
    page * pageSizeNumber + pageSizeNumber,
  );
  const enabledCount = repositories.filter(
    (repository) => repository.enabled,
  ).length;
  const privateCount = repositories.filter(
    (repository) => repository.private,
  ).length;

  React.useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, pageCount - 1));
  }, [pageCount]);

  if (!activeOrganization) {
    return (
      <main className="flex min-h-0 flex-1 flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Repositories</CardTitle>
            <CardDescription>
              Select an organization to search, sync, and manage repositories.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Empty className="min-h-96">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderGit2Icon />
                </EmptyMedia>
                <EmptyTitle>No active organization</EmptyTitle>
                <EmptyDescription>
                  Repository data is scoped to the selected organization.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-medium tracking-tight md:text-3xl">
            Repositories
          </h1>
          <p className="max-w-3xl text-muted-foreground text-sm">
            Search repositories, sync provider data, and jump into repository
            settings from one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              syncMutation.mutate();
            }}
            disabled={syncMutation.isPending}
          >
            <RefreshCcwIcon />
            {syncMutation.isPending ? "Syncing..." : "Sync repositories"}
          </Button>
          <Button type="button" onClick={() => setIsAddOpen(true)}>
            <PlusIcon />
            Add repository
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Total synced</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {repositories.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Enabled for analytics</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {enabledCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Private repositories</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {privateCount}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Repository catalog</CardTitle>
          <CardDescription>
            Filter by repository name, provider, or path.
          </CardDescription>
          <CardAction>
            <Badge variant="outline">
              {filteredRepositories.length} / {repositories.length}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-md">
              <SearchIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search repositories..."
                className="pl-9"
              />
            </div>
            <Select
              value={pageSize}
              onValueChange={(value) => setPageSize(value ?? "10")}
            >
              <SelectTrigger className="w-28">
                <SelectValue placeholder="Page size" />
              </SelectTrigger>
              <SelectContent>
                {["10", "25", "50", "100"].map((size) => (
                  <SelectItem key={size} value={size}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {repositoriesQuery.isLoading ? (
            <RepositorySkeleton />
          ) : filteredRepositories.length > 0 ? (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Repository</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Default branch</TableHead>
                      <TableHead>Visibility</TableHead>
                      <TableHead>Last sync</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRepositories.map((repository) => (
                      <TableRow key={repository.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/60 text-xs font-medium">
                              {getFallback(repository.fullName)}
                            </div>
                            <div className="flex min-w-0 flex-col">
                              <a
                                href={repository.htmlUrl}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="inline-flex items-center gap-1 font-medium hover:underline"
                              >
                                <span className="truncate">
                                  {repository.fullName}
                                </span>
                                <ExternalLinkIcon className="size-3.5" />
                              </a>
                              <span className="max-w-lg truncate text-muted-foreground text-xs">
                                {repository.description ||
                                  repository.repositoryPath}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">
                              {repository.providerName}
                            </Badge>
                            <Badge variant="outline">
                              {repository.providerType}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>{repository.defaultBranch}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {repository.private ? "Private" : "Public"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {repository.lastSyncedAt
                            ? formatDistanceToNow(
                                new Date(repository.lastSyncedAt),
                                {
                                  addSuffix: true,
                                },
                              )
                            : "Never"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-3">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              render={
                                <Link
                                  href={`/repositories/${repository.id}/settings`}
                                  aria-label={`Open settings for ${repository.fullName}`}
                                />
                              }
                            >
                              <Settings2Icon />
                            </Button>
                            <Switch
                              checked={repository.enabled}
                              disabled={toggleMutation.isPending}
                              onCheckedChange={(enabled) =>
                                toggleMutation.mutate({
                                  repositoryId: repository.id,
                                  enabled,
                                })
                              }
                              aria-label={`Toggle analytics for ${repository.fullName}`}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                <div>
                  Page {page + 1} of {pageCount}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={page === 0}
                    onClick={() => setPage((value) => Math.max(0, value - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={page + 1 >= pageCount}
                    onClick={() =>
                      setPage((value) => Math.min(pageCount - 1, value + 1))
                    }
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Empty className="min-h-96">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderGit2Icon />
                </EmptyMedia>
                <EmptyTitle>
                  {search.trim()
                    ? "No matching repositories"
                    : "No repositories synced"}
                </EmptyTitle>
                <EmptyDescription>
                  {search.trim()
                    ? "Try a different search term or clear the filter."
                    : "Open this page again after connecting a Git provider and the list will populate automatically."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add repository</DialogTitle>
            <DialogDescription>
              Choose a connected provider and enter the repository path.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="font-medium text-sm">Provider</div>
              <Select
                value={selectedProviderId}
                onValueChange={(value) => setSelectedProviderId(value ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.length === 0 ? (
                    <SelectItem value="no-provider" disabled>
                      No providers available
                    </SelectItem>
                  ) : null}
                  {providers.map((provider) => (
                    <SelectItem
                      key={provider.providerId}
                      value={provider.providerId}
                    >
                      {provider.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="font-medium text-sm">Repository path</div>
              <Input
                value={repositoryPath}
                onChange={(event) => setRepositoryPath(event.target.value)}
                placeholder="owner/repository"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                addMutation.isPending ||
                !selectedProviderId ||
                !repositoryPath.trim() ||
                providers.length === 0
              }
              onClick={() => {
                addMutation.mutate({
                  providerId: selectedProviderId,
                  repositoryPath,
                });
              }}
            >
              {addMutation.isPending ? "Adding..." : "Add repository"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
