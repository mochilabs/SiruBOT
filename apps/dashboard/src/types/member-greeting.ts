import type { GreetingConfig, GreetingKind } from "@sirubot/utils/memberGreeting";

export interface GreetingPair {
	welcome: GreetingConfig | null;
	goodbye: GreetingConfig | null;
}

export interface GreetingTestStatus {
	found: boolean;
	requestId?: string;
	kind?: GreetingKind;
	ok?: boolean;
	error?: string | null;
	sentAt?: number;
}

export interface GreetingTestResult {
	ok: boolean;
	error: string | null;
	timedOut?: boolean;
}
