"use client";

import { cn } from "@gitpal/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitPalMark } from "./gitpal-mark";
import UserMenu from "./user-menu";
import { Button } from "@gitpal/ui/components/button";

const homeLinks = [
  { to: "/#features", label: "Features" },
  { to: "/#workflow", label: "Workflow" },
  { to: "/#security", label: "Security" },
] as const;

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-border/70 border-b bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-360 items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <GitPalMark className="size-8 text-primary" />
          <div className="flex flex-col">
            <span className="font-bold text-[1rem] text-foreground tracking-[-0.03em]">GitPal</span>
          </div>
        </Link>

        {pathname === "/" && (
          <nav className="hidden items-center gap-1 md:flex">
            {homeLinks.map((link) => (
              <Link
                key={link.to}
                href={link.to}
                className="rounded-full px-4 py-2 font-medium text-muted-foreground text-sm transition hover:bg-muted hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-3">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}