import type { Plugin } from '@opencode-ai/plugin';

// Global flag required for matchAll()/replace() — every match is checked, not just the first.
const SECRET_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
	// Discord bot token
	{ label: 'Discord bot token', pattern: /[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27,}/g },
	// Generic credential assignments
	{ label: 'credential assignment (token/api key/secret/password)', pattern: /(?:token|api[_-]?key|secret|password|passwd|pwd)\s*[:=]\s*["']?[A-Za-z0-9_\-.]{20,}["']?/gi },
	// Database URLs
	{ label: 'database connection URL', pattern: /(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^\s"']+/gi },
	// Sentry DSN
	{ label: 'Sentry DSN', pattern: /https:\/\/[a-f0-9]+@[a-z0-9.\-]+\/[0-9]+/g },
	// AWS keys
	{ label: 'AWS access key', pattern: /AKIA[0-9A-Z]{16}/g },
	// Private keys
	{ label: 'private key', pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g },
	// Bearer tokens
	{ label: 'bearer token', pattern: /Bearer\s+[A-Za-z0-9_\-.]+/g },
	// .env variable assignments with sensitive values
	{ label: 'sensitive env assignment', pattern: /(?:DISCORD_TOKEN|BOT_TOKEN|DATABASE_URL|REDIS_URL|SENTRY_DSN|AUTH_KEY|OWNERS)\s*=\s*.+/gi }
];

// Non-global on purpose: used with .test(), which is stateful (lastIndex) on /g regexes.
const SAFE_PATTERNS = [
	/process\.env\.\w+/,
	/process\.env\[(['"])\w+\1\]/,
	/['"](?:your-.*-here|placeholder|example|xxx|changeme)['"]/i,
	/\$\{[^}]+\}/,
	/\$\w+/
];

function isSafe(match: string): boolean {
	return SAFE_PATTERNS.some((sp) => sp.test(match));
}

function findSecret(text: string): { label: string } | null {
	for (const { label, pattern } of SECRET_PATTERNS) {
		for (const match of text.matchAll(pattern)) {
			if (!isSafe(match[0])) {
				// Never return the matched text — it is the secret itself.
				return { label };
			}
		}
	}
	return null;
}

function redact(text: string): string {
	let result = text;
	for (const { pattern } of SECRET_PATTERNS) {
		result = result.replace(pattern, (m) => (isSafe(m) ? m : '[REDACTED]'));
	}
	return result;
}

const WRITE_TOOLS = new Set(['write', 'edit', 'multiedit']);

export const SecretBlocker: Plugin = async () => {
	return {
		'tool.execute.before': async (input, output) => {
			const args = output.args as Record<string, unknown>;

			if (input.tool === 'bash') {
				const command = args.command as string | undefined;
				if (!command) return;

				const hit = findSecret(command);
				if (hit) {
					args.command = `echo "⚠️ Blocked by secret-blocker plugin: ${hit.label} detected in command. Reference environment variables instead of literal secrets."`;
				}
				return;
			}

			if (WRITE_TOOLS.has(input.tool)) {
				const content = (args.content ?? args.newString) as string | undefined;
				if (!content) return;

				const hit = findSecret(content);
				if (hit) {
					throw new Error(`secret-blocker: blocked ${input.tool} containing ${hit.label}. Write a placeholder or env var reference instead.`);
				}
			}
		},

		// Secrets most often leak via command output (e.g. `cat .env`) — redact them
		// before the output lands in the session transcript.
		'tool.execute.after': async (input, output) => {
			if (input.tool !== 'bash') return;
			if (typeof output.output === 'string' && findSecret(output.output)) {
				output.output = redact(output.output);
			}
		}
	};
};

export default SecretBlocker;
