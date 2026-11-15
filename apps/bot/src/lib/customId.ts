/**
 * Discord 컴포넌트·모달 customId의 공용 코덱.
 *
 * 기능마다 `defineCustomId`로 ID를 한 번만 선언하고, 뷰는 `encode`로 만들고 핸들러는 `decode`로 해석해요.
 * 그래서 뷰와 핸들러가 같은 선언을 보게 되고, 필드 타입이 어긋나면 컴파일 단계에서 막혀요.
 *
 * 형식: `{namespace}:v{version}:{action}[:{field}...]` — 구분자는 `:` 하나뿐이에요.
 * - 필드 값은 구분자를 포함할 수 없는 문자만 허용해서(스노우플레이크·정수·짧은 토큰·고정 목록) 이스케이프가 필요 없어요.
 * - 선언 시점에 액션별 최악 길이를 계산해 Discord 한도(100자)를 넘으면 바로 던져요.
 * - 인코딩 시점에도 한도와 필드 값을 다시 확인하고, 어긋나면 던져요. 잘못된 ID는 프로그래밍 오류예요.
 * - `decode`는 이 선언(namespace + version)의 ID가 아니거나 형식이 깨졌으면 `null`을 돌려줘요. 옛 형식을 달래 주는 분기는 두지 않아요.
 */

/** Discord customId 길이 한도. */
export const CUSTOM_ID_MAX_LENGTH = 100;
const DELIMITER = ':';
const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/;
const ACTION_PATTERN = /^[a-zA-Z][a-zA-Z0-9-]*$/;
/** 토큰·고정 목록 값이 따르는 문자 집합 — 구분자와 `-`(null 표시)로 시작하는 값을 배제해요. */
const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const SNOWFLAKE_PATTERN = /^\d{17,20}$/;
const UINT_PATTERN = /^(0|[1-9]\d*)$/;
const NULL_MARK = '-';

/** customId 필드 한 칸의 인코딩 규칙. */
export interface CustomIdField<T> {
	/** 인코딩된 값이 가질 수 있는 최대 길이 — 선언 시점의 한도 검사에 쓰여요. */
	readonly maxLength: number;
	/** 값을 문자열로 바꿔요. 허용되지 않는 값이면 던져요. */
	encode(value: T): string;
	/** 문자열을 값으로 되돌려요. 형식이 맞지 않으면 null이고, 맞으면 값을 한 겹 감싸 돌려줘요(값 자체가 null일 수 있어서예요). */
	decode(raw: string): { value: T } | null;
}

function fail(message: string): never {
	throw new Error(`[customId] ${message}`);
}

/** 필드 값 종류 모음 — `defineCustomId`의 액션 선언에서 써요. */
export const field = {
	/** 디스코드 스노우플레이크(17~20자리 숫자). */
	snowflake(): CustomIdField<string> {
		return {
			maxLength: 20,
			encode(value) {
				return SNOWFLAKE_PATTERN.test(value) ? value : fail(`스노우플레이크가 아니에요: ${JSON.stringify(value)}`);
			},
			decode: (raw) => (SNOWFLAKE_PATTERN.test(raw) ? { value: raw } : null)
		};
	},

	/** 0 이상의 정수. 자리수는 `maxDigits`까지예요. */
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

	/** 짧은 토큰(영숫자로 시작하고 영숫자·`_`·`.`·`-`로 이어지는 문자열). */
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

	/** 고정된 값 목록 중 하나. */
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

	/** 값이 없을 수 있는 필드 — null은 `-`로 적어요. */
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

/** `decode`가 돌려주는 값 — `action`으로 좁히면 그 액션의 필드 타입이 나와요. */
export type DecodedCustomId<A extends ActionMap> = {
	[K in keyof A & string]: { action: K } & FieldValues<A[K]>;
}[keyof A & string];

export interface CustomIdCodec<A extends ActionMap> {
	readonly namespace: string;
	readonly version: number;
	/** `{namespace}:v{version}:` — 이 선언의 ID가 모두 이 접두로 시작해요. */
	readonly prefix: string;
	/** 액션과 필드로 customId를 만들어요. 한도를 넘거나 값이 허용되지 않으면 던져요. */
	encode<K extends keyof A & string>(action: K, ...fields: EncodeArgs<A[K]>): string;
	/** customId를 해석해요. 이 선언의 ID가 아니거나 형식이 깨졌으면 null이에요. */
	decode(customId: string): DecodedCustomId<A> | null;
}

const registry = new Set<string>();

/** 지금까지 선언된 namespace 목록 — 유일성 테스트에서 써요. */
export function registeredCustomIdNamespaces(): string[] {
	return [...registry];
}

/** 테스트에서 선언을 비울 때만 써요. */
export function resetCustomIdRegistryForTesting(): void {
	registry.clear();
}

/**
 * customId 선언 — namespace는 봇 전체에서 유일해야 해요(중복이면 던져요).
 * `actions`는 액션 이름 → 필드 이름·종류 순서대로 적은 객체예요. 필드 순서가 곧 customId 안의 순서예요.
 */
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
