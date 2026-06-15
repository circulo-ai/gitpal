import { Badge } from "@gitpal/ui/components/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@gitpal/ui/components/card";

export default function DeveloperSettingsRoute() {
	return (
		<main className="flex min-h-0 flex-1 flex-col gap-6">
			<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
				<div className="space-y-1">
					<h1 className="font-heading text-2xl font-medium tracking-tight md:text-3xl">
						Developer settings
					</h1>
					<p className="max-w-3xl text-muted-foreground text-sm">
						Reserved for integrations, API-facing controls, and advanced setup.
					</p>
				</div>
				<Badge variant="outline">Protected</Badge>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Integration controls</CardTitle>
					<CardDescription>
						This area is ready for enterprise Git host onboarding and other
						advanced controls.
					</CardDescription>
				</CardHeader>
				<CardContent className="text-sm text-muted-foreground">
					We are keeping this route in place so the developer surface has a
					dedicated home once the remaining integrations land.
				</CardContent>
			</Card>
		</main>
	);
}
