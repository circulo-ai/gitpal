import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";
import { env } from "@gitpal/env/server";
import type { z } from "zod";

const envelopeVersion = "v1";

function getEncryptionKey() {
	return createHash("sha256").update(env.BETTER_AUTH_SECRET).digest();
}

export function encryptSecretEnvelope(value: unknown | null) {
	if (!value) {
		return null;
	}

	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
	const ciphertext = Buffer.concat([
		cipher.update(JSON.stringify(value), "utf8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();

	return [
		envelopeVersion,
		iv.toString("base64url"),
		tag.toString("base64url"),
		ciphertext.toString("base64url"),
	].join(":");
}

export function decryptSecretEnvelope<T>(
	value: string | null,
	schema: z.ZodType<T>,
) {
	if (!value) {
		return null;
	}

	const [version, iv, tag, ciphertext] = value.split(":");
	if (version !== envelopeVersion || !iv || !tag || !ciphertext) {
		return null;
	}

	try {
		const decipher = createDecipheriv(
			"aes-256-gcm",
			getEncryptionKey(),
			Buffer.from(iv, "base64url"),
		);
		decipher.setAuthTag(Buffer.from(tag, "base64url"));

		const raw = Buffer.concat([
			decipher.update(Buffer.from(ciphertext, "base64url")),
			decipher.final(),
		]).toString("utf8");

		return schema.parse(JSON.parse(raw));
	} catch {
		return null;
	}
}
