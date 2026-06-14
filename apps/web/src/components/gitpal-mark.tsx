import { cn } from "@gitpal/ui/lib/utils";

type GitPalMarkProps = {
	className?: string;
};

export function GitPalMark({ className }: GitPalMarkProps) {
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#ff7a3d_0%,#f066b1_100%)] font-semibold text-[0.72rem] text-white shadow-[0_16px_30px_rgba(240,102,177,0.18)]",
				className,
			)}
		>
			GP
		</span>
	);
}
