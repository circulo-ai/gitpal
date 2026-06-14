import { cn } from "@gitpal/ui/lib/utils";

type GitPalMarkProps = {
	className?: string;
};

export function GitPalMark({ className }: GitPalMarkProps) {
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#ff8a5b_0%,#d9784d_100%)] font-semibold text-[#170c08] text-[0.72rem] shadow-[0_14px_28px_rgba(255,138,91,0.18)]",
				className,
			)}
		>
			GP
		</span>
	);
}
