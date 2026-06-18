import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@gitpal/ui/components/avatar";
import { Button } from "@gitpal/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@gitpal/ui/components/dropdown-menu";
import { Skeleton } from "@gitpal/ui/components/skeleton";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

type UserMenuUser = {
  name: string;
  email: string;
  image?: string | null;
};

type UserMenuProps = {
  user?: UserMenuUser;
};

export default function UserMenu({ user }: UserMenuProps) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const effectiveUser = session?.user ?? user;

  if (isPending && !effectiveUser) {
    return <Skeleton className="h-9 w-24" />;
  }

  if (!effectiveUser) {
    return (
      <Link href="/login">
        <Button variant="outline">Sign in</Button>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" className="h-9 rounded-full" />}
      >
        <Avatar className="size-8">
          {effectiveUser.image ? (
            <AvatarImage src={effectiveUser.image} alt={effectiveUser.name} />
          ) : null}
          <AvatarFallback>
            {effectiveUser.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="hidden max-w-32 truncate sm:inline">
          {effectiveUser.name}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-card">
        <DropdownMenuGroup>
          <DropdownMenuLabel>My Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>{effectiveUser.email}</DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              if (session) {
                authClient.signOut({
                  fetchOptions: {
                    onSuccess: () => {
                      router.push("/");
                    },
                  },
                });
                return;
              }

              router.push("/login");
            }}
          >
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
