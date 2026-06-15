import { cn } from "@gitpal/ui/lib/utils";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";

function Spinner({
	className,
	...props
}: Omit<ComponentProps<typeof HugeiconsIcon>, "icon">) {
	return (
		<HugeiconsIcon
			icon={Loading03Icon}
			role="status"
			aria-label="Loading"
			className={cn("size-4 animate-spin", className)}
			{...props}
		/>
	);
}

export { Spinner };
