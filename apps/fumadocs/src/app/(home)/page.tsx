import { Card, Cards } from "fumadocs-ui/components/card";
import {
  BookOpenIcon,
  GitPullRequestIcon,
  ShieldCheckIcon,
  WalletIcon,
  WandSparklesIcon,
  WrenchIcon,
} from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="relative flex-1 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),_transparent_36%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.14),_transparent_30%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-6rem)] max-w-6xl flex-col justify-center px-6 py-20">
        <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
          <ShieldCheckIcon className="size-3.5" />
          GitPal documentation
        </div>
        <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
          Production docs for automated PR review, labels, tools, and billing.
        </h1>
        <p className="mt-6 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
          GitPal helps teams review GitHub and GitLab changes with curated model
          selection, provider-native reviewer assignment, wallet-aware billing,
          and a settings preview that mirrors the real comment output.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/docs"
            className="inline-flex items-center justify-center rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
          >
            Browse docs
          </Link>
          <Link
            href="/docs/getting-started"
            className="inline-flex items-center justify-center rounded-full border border-border/60 bg-background/70 px-5 py-3 text-sm font-medium transition-colors hover:bg-muted/40"
          >
            Start here
          </Link>
        </div>
        <div className="mt-14">
          <Cards className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Card
              title="Getting started"
              description="Connect a provider, tune the settings, and run the first review."
              href="/docs/getting-started"
              icon={<BookOpenIcon className="size-5" />}
            />
            <Card
              title="AI review"
              description="Reviewer, walkthrough, labeler, routing, and model controls."
              href="/docs/ai"
              icon={<WandSparklesIcon className="size-5" />}
            />
            <Card
              title="Tools and MCP"
              description="Built-in tools, automatic MCP binding, and repository overrides."
              href="/docs/tools"
              icon={<WrenchIcon className="size-5" />}
            />
            <Card
              title="Integrations"
              description="GitHub, GitLab, webhooks, and native reviewer mapping."
              href="/docs/integrations"
              icon={<GitPullRequestIcon className="size-5" />}
            />
            <Card
              title="Billing"
              description="Wallet settlement, BYOK routing, and generation tracking."
              href="/docs/billing"
              icon={<WalletIcon className="size-5" />}
            />
            <Card
              title="Operations"
              description="Production readiness, observability, and troubleshooting."
              href="/docs/operations"
              icon={<ShieldCheckIcon className="size-5" />}
            />
          </Cards>
        </div>
      </div>
    </main>
  );
}
