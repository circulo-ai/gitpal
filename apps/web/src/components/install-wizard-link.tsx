import { buttonVariants } from "@gitpal/ui/components/button";
import { cn } from "@gitpal/ui/lib/utils";
import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";

export function InstallWizardLink({
	className,
	label = "Open install wizard",
}: {
	className?: string;
	label?: string;
}) {
	return (
		<Link
			href="/login"
			className={cn(buttonVariants({ variant: "outline" }), className)}
		>
			<ExternalLinkIcon />
			{label}
		</Link>
	);
}
