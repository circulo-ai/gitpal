import * as React from "react";
import {
	type ConnectorAuthMethod,
	type ConnectorType,
	connectorProviders,
	connectorTypeLabels,
	getConnectorProvider,
} from "./catalog";

export function useConnectorProviders(type?: ConnectorType) {
	return React.useMemo(
		() =>
			connectorProviders.filter((provider) =>
				type ? provider.type === type : true,
			),
		[type],
	);
}

export function useConnectorProvider(providerId: string | null | undefined) {
	return React.useMemo(
		() => (providerId ? getConnectorProvider(providerId) : null),
		[providerId],
	);
}

export function ConnectorTypeLabel({ type }: { type: ConnectorType }) {
	return <>{connectorTypeLabels[type]}</>;
}

export function ConnectorAuthMethodLabel({
	method,
}: {
	method: ConnectorAuthMethod;
}) {
	const label =
		method === "api_key" ? "API key" : method === "oauth" ? "OAuth" : "None";

	return <>{label}</>;
}
