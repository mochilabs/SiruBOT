import type { Plugin } from '@opencode-ai/plugin';

const SECRET_PATTERNS = [
	// Discord bot token
	/[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27,}/g,
	// Generic token patterns
	/(?:token|api[_-]?key|secret|password|passwd|pwd)\s*[:=]\s*["']?[A-Za-z0-9_\-\.]{20,}["']?/gi,
	// Database URLs
	/(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^\s"']+/gi,
	// Sentry DSN
	/https:\/\/[a-f0-9]+@[a-z0-9.\-]+\/[0-9]+/g,
	// AWS keys
	/AKIA[0-9A-Z]{16}/g,
	// Private keys
	/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g,
	// Bearer tokens
	/Bearer\s+[A-Za-z0-9_\-\.]+/g,
	// .env variable assignments with sensitive values
	/(?:DISCORD_TOKEN|BOT_TOKEN|DATABASE_URL|REDIS_URL|SENTRY_DSN|OWNERS)\s*=\s*.+/gi
];

const SAFE_PATTERNS = [
	/process\.env\.\w+/g,
	/['"](?:your-.*-here|placeholder|example|xxx|changeme)['"]/gi,
	/\$\{[^}]+\}/g,
	/process\.env\[(['"])\w+\1\]/g
];

function containsSecret(text: string): { found: boolean; pattern?: string } {
	for (const pattern of SECRET_PATTERNS) {
		const match = text.match(pattern);
		if (match) {
			// Check if it's a false positive (safe pattern)
			const isSafe = SAFE_PATTERNS.some((sp) => sp.test(match[0]));
			if (!isSafe) {
				return { found: true, pattern: match[0].slice(0, 30) + '...' };
			}
		}
	}
	return { found: false };
}

export const SecretBlocker: Plugin = async () => {
	return {
		'execute.after': async (input, output) => {
			if (input.tool !== 'bash') return;

			const command = input.args.command as string | undefined;
			if (!command) return;

			// Check for echo/cat/printing secrets
			const result = containsSecret(command);
			if (result.found) {
				output.args.command = 'echo "⚠️ Secret detected in command — blocked by secret-blocker plugin."';
				return;
			}
		},

		'file.write.after': async (input) => {
			const content = input.args.content as string | undefined;
			if (!content) return;

			const result = containsSecret(content);
			if (result.found) {
				input.args.content =
					content +
					'\n\n// ⚠️ WARNING: Potential secret detected in this file by secret-blocker plugin. Review before committing.';
			}
		}
	};
};

export default SecretBlocker;
