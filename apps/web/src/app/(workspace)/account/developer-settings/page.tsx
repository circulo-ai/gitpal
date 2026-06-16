import { redirect } from "next/navigation";

export default function DeveloperSettingsRoute() {
	redirect("/account/api-keys");
}
