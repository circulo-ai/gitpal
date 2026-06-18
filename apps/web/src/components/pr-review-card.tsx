"use client";

import { cn } from "@gitpal/ui/lib/utils";
import { Check, ChevronDown, GitMerge, GitPullRequest } from "lucide-react";
import { useEffect, useState } from "react";
import { GitPalMark } from "./gitpal-mark";

const SEQUENCE_MS = 2400;
const TOTAL_STEPS = 4; // 0=reviewing → 1=comment → 2=suggestion → 3=committed/passed → 4=mergeable

const COMMENT_BODY =
	"Magic links should be one-time use. Right now a token stays valid until it expires, so it can be replayed. Mark the token as consumed (store a used_at timestamp) the moment it's redeemed.";

// GitHub light-theme palette (kept literal so it reads as unmistakably GitHub)
const gh = {
	border: "border-[#d1d9e0]",
	subtle: "bg-[#f6f8fa]",
	canvas: "bg-white",
	text: "text-[#1f2328]",
	muted: "text-[#59636e]",
	blue: "text-[#0969da]",
	greenText: "text-[#1a7f37]",
};

function StepDots({
	step,
	onPick,
}: {
	step: number;
	onPick: (s: number) => void;
}) {
	return (
		<div className="flex items-center gap-1.5">
			{Array.from({ length: TOTAL_STEPS + 1 }).map((_, i) => (
				<button
					key={i}
					type="button"
					aria-label={`Go to step ${i + 1}`}
					onClick={() => onPick(i)}
					className={cn(
						"h-1.5 rounded-full transition-all duration-300",
						i === step
							? "w-5 bg-[#0969da]"
							: "w-1.5 bg-[#d1d9e0] hover:bg-[#aeb8c2]",
					)}
				/>
			))}
		</div>
	);
}

function TypingDots() {
	return (
		<span className="inline-flex items-center gap-1">
			{[0, 1, 2].map((i) => (
				<span
					key={i}
					className="size-1.5 animate-bounce rounded-full bg-[#59636e]"
					style={{ animationDelay: `${i * 0.15}s` }}
				/>
			))}
		</span>
	);
}

export function PrReviewCard() {
	const [step, setStep] = useState(0);
	const [paused, setPaused] = useState(false);

	useEffect(() => {
		if (
			typeof window !== "undefined" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches
		) {
			setStep(TOTAL_STEPS);
			return;
		}
		if (paused) return;
		const id = setInterval(
			() => setStep((s) => (s >= TOTAL_STEPS ? 0 : s + 1)),
			SEQUENCE_MS,
		);
		return () => clearInterval(id);
	}, [paused]);

	const reviewing = step < 1;
	const showComment = step >= 1;
	const showSuggestion = step >= 2;
	const committed = step >= 3;
	const checksPassed = step >= 3;

	const reveal = (visible: boolean) =>
		cn(
			"transition-all duration-500 ease-out",
			visible
				? "translate-y-0 opacity-100"
				: "pointer-events-none translate-y-2 opacity-0",
		);

	return (
		<div className="relative isolate w-full max-w-xl justify-self-center md:justify-self-end">
			{/* ambient glow */}
			<div className="absolute -inset-8 -z-10 rounded-[2.5rem] bg-primary/10 blur-3xl" />

			<div
				onMouseEnter={() => setPaused(true)}
				onMouseLeave={() => setPaused(false)}
				className={cn(
					"overflow-hidden rounded-2xl border shadow-2xl ring-1 ring-black/5",
					gh.canvas,
					gh.border,
					gh.text,
				)}
			>
				{/* browser chrome */}
				<div
					className={cn(
						"flex items-center gap-3 border-b px-4 py-2.5",
						gh.border,
						gh.subtle,
					)}
				>
					<div className="flex gap-1.5">
						<span className="size-3 rounded-full bg-[#ff5f57]" />
						<span className="size-3 rounded-full bg-[#febc2e]" />
						<span className="size-3 rounded-full bg-[#28c840]" />
					</div>
					<div className="mx-auto flex w-[60%] items-center justify-center gap-2 rounded-md border border-[#d1d9e0] bg-white px-3 py-1 text-[#59636e] text-[0.72rem]">
						<svg
							viewBox="0 0 16 16"
							className="size-3 fill-[#59636e]"
							aria-hidden
						>
							<path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm5.93 5h-2.38a12.6 12.6 0 0 0-1-2.62A6.02 6.02 0 0 1 13.93 5ZM8 2c.64.93 1.13 1.93 1.46 3H6.54C6.87 3.93 7.36 2.93 8 2Z" />
						</svg>
						github.com/acme/api/pull/318
					</div>
				</div>

				{/* PR header */}
				<div className="px-5 pt-4">
					<div className="flex items-start justify-between gap-3">
						<h3 className="font-semibold text-[1.05rem] leading-snug">
							feat(auth): add magic link sign in{" "}
							<span className={gh.muted}>#318</span>
						</h3>
						<span
							className={cn(
								"inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-medium text-[0.75rem] text-white transition-colors duration-500",
								committed ? "bg-[#8250df]" : "bg-[#1a7f37]",
							)}
						>
							{committed ? (
								<GitMerge className="size-3.5" />
							) : (
								<GitPullRequest className="size-3.5" />
							)}
							{committed ? "Mergeable" : "Open"}
						</span>
					</div>
					<p className={cn("mt-1 text-[0.82rem]", gh.muted)}>
						<span className="font-medium text-[#1f2328]">alex</span> wants to
						merge 1 commit into{" "}
						<code className="rounded bg-[#ddf4ff] px-1 text-[#0969da]">
							main
						</code>{" "}
						from{" "}
						<code className="rounded bg-[#f6f8fa] px-1">feat/magic-link</code>
					</p>
				</div>

				{/* tabs */}
				<div
					className={cn(
						"mt-3 flex items-center gap-5 border-b px-5 text-[0.8rem]",
						gh.border,
					)}
				>
					{["Conversation", "Commits", "Checks", "Files changed"].map(
						(t, i) => (
							<span
								key={t}
								className={cn(
									"-mb-px border-b-2 py-2.5",
									i === 0
										? "border-[#fd8c73] font-semibold text-[#1f2328]"
										: "border-transparent text-[#59636e]",
								)}
							>
								{t}
								{i === 3 ? (
									<span className="ml-1 rounded-full bg-[#eaeef2] px-1.5 text-[0.7rem]">
										1
									</span>
								) : null}
							</span>
						),
					)}
				</div>

				{/* conversation timeline */}
				<div className="relative px-5 py-4">
					<div className="absolute top-6 bottom-6 left-[2.35rem] w-px bg-[#d1d9e0]" />

					{/* opened event */}
					<div className="relative flex items-center gap-3 pb-4">
						<div className="z-10 flex size-7 items-center justify-center rounded-full bg-[#1a7f37] text-white ring-4 ring-white">
							<GitPullRequest className="size-3.5" />
						</div>
						<p className={cn("text-[0.8rem]", gh.muted)}>
							<span className="font-medium text-[#1f2328]">alex</span> opened
							this pull request
						</p>
					</div>

					{/* reviewing indicator */}
					<div
						className={cn(
							"relative flex items-center gap-3 pb-4",
							reviewing ? "flex" : "hidden",
						)}
					>
						<div className="z-10 flex size-7 items-center justify-center rounded-full bg-white text-[#1f2328] ring-4 ring-white">
							<GitPalMark />
						</div>
						<div className="flex items-center gap-2 text-[#59636e] text-[0.8rem]">
							<span className="font-medium text-[#1f2328]">GitPal</span> is
							reviewing the changes
							<TypingDots />
						</div>
					</div>

					{/* GitPal review comment */}
					<div className={cn("relative", reveal(showComment))}>
						<div className="flex gap-3">
							<div className="z-10 flex size-7 shrink-0 items-center justify-center rounded-full ring-4 ring-white">
								<GitPalMark className="size-3.5" />
							</div>
							<div
								className={cn("min-w-0 flex-1 rounded-md border", gh.border)}
							>
								<div
									className={cn(
										"flex items-center gap-2 rounded-t-md border-b px-3 py-2 text-[0.8rem]",
										gh.border,
										gh.subtle,
									)}
								>
									<span className="font-semibold">GitPal</span>
									<span className="rounded-full border border-[#d1d9e0] px-1.5 font-medium text-[#59636e] text-[0.65rem]">
										bot
									</span>
									<span className="rounded-md bg-[#fff1e5] px-1.5 font-medium text-[#bc4c00] text-[0.68rem]">
										High severity
									</span>
									<span className={cn("ml-auto", gh.muted)}>just now</span>
								</div>
								<div className="px-3 py-2.5">
									<p className="text-[0.85rem] leading-[1.45]">
										{COMMENT_BODY}
									</p>

									{/* suggested change */}
									<div
										className={cn(
											"mt-3 overflow-hidden rounded-md border",
											gh.border,
											reveal(showSuggestion),
										)}
									>
										<div
											className={cn(
												"flex items-center justify-between border-b px-3 py-1.5 font-medium text-[0.76rem]",
												gh.border,
												gh.subtle,
											)}
										>
											<span>Suggested change</span>
											<span className={gh.muted}>magic-link.ts</span>
										</div>
										<div className="overflow-x-auto font-mono text-[0.76rem] leading-5">
											<div className="flex gap-3 bg-[#ffebe9] px-3 py-0.5 text-[#82071e]">
												<span className="select-none text-[#cf222e]">-</span>
												<span className="whitespace-pre">return token;</span>
											</div>
											<div className="flex gap-3 bg-[#dafbe1] px-3 py-0.5 text-[#0a3a1e]">
												<span className="select-none text-[#1a7f37]">+</span>
												<span className="whitespace-pre">
													await db.query('UPDATE magic_links SET used_at = NOW()
													WHERE token = $1', [token]);
												</span>
											</div>
											<div className="flex gap-3 bg-[#dafbe1] px-3 py-0.5 text-[#0a3a1e]">
												<span className="select-none text-[#1a7f37]">+</span>
												<span className="whitespace-pre">return token;</span>
											</div>
										</div>
										<div
											className={cn(
												"flex items-center justify-end gap-2 border-t px-3 py-2",
												gh.border,
												gh.subtle,
											)}
										>
											<button
												type="button"
												className="rounded-md border border-[#d1d9e0] bg-white px-2.5 py-1 font-medium text-[0.74rem] hover:bg-[#f3f4f6]"
											>
												Add to batch
											</button>
											<button
												type="button"
												className={cn(
													"inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium text-[0.74rem] text-white transition-colors duration-500",
													committed
														? "bg-[#1a7f37]"
														: "bg-[#1f883d] hover:bg-[#1a7f37]",
												)}
											>
												{committed ? <Check className="size-3.5" /> : null}
												{committed ? "Committed" : "Commit suggestion"}
											</button>
										</div>
									</div>

									{/* reactions */}
									<div className="mt-2.5 flex items-center gap-2">
										<span className="inline-flex items-center gap-1 rounded-full border border-[#d1d9e0] px-2 py-0.5 text-[0.74rem]">
											👍 3
										</span>
										<span className="inline-flex items-center gap-1 rounded-full border border-[#d1d9e0] px-2 py-0.5 text-[0.74rem]">
											🎉 1
										</span>
									</div>
								</div>
							</div>
						</div>
					</div>

					{/* checks box */}
					<div className={cn("relative mt-4 flex gap-3", reveal(showComment))}>
						<div className="z-10 size-7 shrink-0 rounded-full bg-white ring-4 ring-white" />
						<div className={cn("flex-1 rounded-md border", gh.border)}>
							<div className="flex items-center gap-2.5 px-3 py-2.5">
								<span
									className={cn(
										"flex size-5 items-center justify-center rounded-full transition-colors duration-500",
										checksPassed
											? "bg-[#1a7f37] text-white"
											: "bg-[#bf8700] text-white",
									)}
								>
									{checksPassed ? (
										<Check className="size-3" />
									) : (
										<span className="size-2 animate-pulse rounded-full bg-white" />
									)}
								</span>
								<div className="min-w-0">
									<p className="font-semibold text-[0.82rem]">
										{checksPassed
											? "All checks have passed"
											: "Some checks haven't completed yet"}
									</p>
									<p className={cn("text-[0.76rem]", gh.muted)}>
										{checksPassed
											? "3 successful checks · GitPal review"
											: "GitPal review in progress…"}
									</p>
								</div>
							</div>
							<div
								className={cn(
									"flex items-center gap-3 border-t px-3 py-2.5",
									gh.border,
								)}
							>
								<button
									type="button"
									disabled={!checksPassed}
									className={cn(
										"inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold text-[0.78rem] text-white transition-all duration-500",
										checksPassed
											? "bg-[#8250df] hover:bg-[#6f42c1]"
											: "cursor-not-allowed bg-[#94d3a2]",
									)}
								>
									<GitMerge className="size-3.5" />
									Merge pull request
								</button>
								<span className={cn("text-[0.76rem]", gh.muted)}>
									{checksPassed
										? "This branch has no conflicts"
										: "Waiting on checks"}
								</span>
								<ChevronDown className={cn("ml-auto size-4", gh.muted)} />
							</div>
						</div>
					</div>
				</div>

				{/* footer / progress */}
				<div
					className={cn(
						"flex items-center justify-between border-t px-5 py-3",
						gh.border,
						gh.subtle,
					)}
				>
					<span className="flex items-center gap-2 text-[#59636e] text-[0.75rem]">
						<span className="size-2 animate-pulse rounded-full bg-[#1a7f37]" />
						Live review
					</span>
					<StepDots step={step} onPick={setStep} />
				</div>
			</div>
		</div>
	);
}
