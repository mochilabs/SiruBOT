export const CUSTOM_ID_MAX_LENGTH = 100;
const DELIMITER = ':';
const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/;
const ACTION_PATTERN = /^[a-zA-Z][a-zA-Z0-9-]*$/;
const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const SNOWFLAKE_PATTERN = /^\d{17,20}$/;
const UINT_PATTERN = /^(0|[1-9]\d*)$/;
const NULL_MARK = '-';

export interface CustomIdField<T> {
	readonly maxLength: number;
	encode(value: T): string;
	decode(raw: string): { value: T } | null;
}

function fail(message: string): never {
	throw new Error(`[customId] ${message}`);
}

export const field = {
	snowflake(): CustomIdField<string> {
		return {
			maxLength: 20,
			encode(value) {
				return SNOWFLAKE_PATTERN.test(value) ? value : fail(`스노우플레이크가 아니에요: ${JSON.stringify(value)}`);
			},
			decode: (raw) => (SNOWFLAKE_PATTERN.test(raw) ? { value: raw } : null)
		};
	},

	uint({ maxDigits = 9 }: { maxDigits?: number } = {}): CustomIdField<number> {
		return {
			maxLength: maxDigits,
			encode(value) {
				const text = String(value);
				return Number.isSafeInteger(value) && value >= 0 && text.length <= maxDigits
					? text
					: fail(`0 이상의 ${maxDigits}자리 이하 정수가 아니에요: ${value}`);
			},
			decode: (raw) => (UINT_PATTERN.test(raw) && raw.length <= maxDigits ? { value: Number(raw) } : null)
		};
	},

	token({ maxLength = 40 }: { maxLength?: number } = {}): CustomIdField<string> {
		return {
			maxLength,
			encode(value) {
				return TOKEN_PATTERN.test(value) && value.length <= maxLength
					? value
					: fail(`토큰 형식이 아니에요(최대 ${maxLength}자): ${JSON.stringify(value)}`);
			},
			decode: (raw) => (TOKEN_PATTERN.test(raw) && raw.length <= maxLength ? { value: raw } : null)
		};
	},

	oneOf<const V extends readonly string[]>(values: V): CustomIdField<V[number]> {
		for (const value of values) {
			if (!TOKEN_PATTERN.test(value)) fail(`고정 목록 값이 토큰 형식이 아니에요: ${JSON.stringify(value)}`);
		}
		return {
			maxLength: Math.max(...values.map((value) => value.length)),
			encode(value) {
				return values.includes(value) ? value : fail(`허용되지 않는 값이에요: ${JSON.stringify(value)}`);
			},
			decode: (raw) => (values.includes(raw) ? { value: raw as V[number] } : null)
		};
	},

	nullable<T>(inner: CustomIdField<T>): CustomIdField<T | null> {
		return {
			maxLength: Math.max(NULL_MARK.length, inner.maxLength),
			encode: (value) => (value === null ? NULL_MARK : inner.encode(value)),
			decode: (raw) => (raw === NULL_MARK ? { value: null } : inner.decode(raw))
		};
	}
};

type FieldMap = Record<string, CustomIdField<any>>;
type ActionMap = Record<string, FieldMap>;
type FieldValues<F extends FieldMap> = { [K in keyof F]: F[K] extends CustomIdField<infer T> ? T : never };
type EncodeArgs<F extends FieldMap> = keyof F extends never ? [] : [fields: FieldValues<F>];

export type DecodedCustomId<A extends ActionMap> = {
	[K in keyof A & string]: { action: K } & FieldValues<A[K]>;
}[keyof A & string];

export interface CustomIdCodec<A extends ActionMap> {
	readonly namespace: string;
	readonly version: number;
	readonly prefix: string;
	encode<K extends keyof A & string>(action: K, ...fields: EncodeArgs<A[K]>): string;
	decode(customId: string): DecodedCustomId<A> | null;
}

const registry = new Set<string>();

export function registeredCustomIdNamespaces(): string[] {
	return [...registry];
}

export function customIdNamespace(customId: string): string | null {
	const sep = customId.indexOf(':');
	if (sep <= 0) return null;
	const namespace = customId.slice(0, sep);
	return registry.has(namespace) ? namespace : null;
}

export function resetCustomIdRegistryForTesting(): void {
	registry.clear();
}

export function defineCustomId<const A extends ActionMap>(spec: { namespace: string; version: number; actions: A }): CustomIdCodec<A> {
	const { namespace, version, actions } = spec;
	if (!NAMESPACE_PATTERN.test(namespace)) fail(`namespace 형식이 올바르지 않아요: ${JSON.stringify(namespace)}`);
	if (!Number.isInteger(version) || version < 1) fail(`version은 1 이상의 정수여야 해요: ${namespace}`);
	if (registry.has(namespace)) fail(`namespace가 이미 선언돼 있어요: ${namespace}`);

	const prefix = `${namespace}${DELIMITER}v${version}${DELIMITER}`;
	const entries = Object.entries(actions).map(([action, fields]) => {
		if (!ACTION_PATTERN.test(action)) fail(`액션 이름 형식이 올바르지 않아요: ${namespace}.${action}`);
		const names = Object.keys(fields);
		if (names.includes('action')) fail(`필드 이름 'action'은 쓸 수 없어요: ${namespace}.${action}`);
		const worstCase = prefix.length + action.length + names.reduce((sum, name) => sum + 1 + fields[name]!.maxLength, 0);
		if (worstCase > CUSTOM_ID_MAX_LENGTH) fail(`최악의 경우 ${worstCase}자라 ${CUSTOM_ID_MAX_LENGTH}자를 넘어요: ${namespace}.${action}`);
		return [action, names] as const;
	});
	registry.add(namespace);
	const fieldNames = new Map<string, readonly string[]>(entries);

	return {
		namespace,
		version,
		prefix,
		encode(action, ...args) {
			const names = fieldNames.get(action);
			if (!names) fail(`선언되지 않은 액션이에요: ${namespace}.${action}`);
			const values = (args[0] ?? {}) as Record<string, unknown>;
			const segments = names.map((name) => actions[action]![name]!.encode(values[name]));
			const customId = [`${namespace}${DELIMITER}v${version}`, action, ...segments].join(DELIMITER);
			if (customId.length > CUSTOM_ID_MAX_LENGTH) fail(`${customId.length}자라 ${CUSTOM_ID_MAX_LENGTH}자를 넘어요: ${namespace}.${action}`);
			return customId;
		},
		decode(customId) {
			if (!customId.startsWith(prefix)) return null;
			const [action, ...raws] = customId.slice(prefix.length).split(DELIMITER);
			const names = action === undefined ? undefined : fieldNames.get(action);
			if (!action || !names || raws.length !== names.length) return null;
			const decoded: Record<string, unknown> = { action };
			for (const [index, name] of names.entries()) {
				const result = actions[action]![name]!.decode(raws[index]!);
				if (!result) return null;
				decoded[name] = result.value;
			}
			return decoded as DecodedCustomId<A>;
		}
	};
}
