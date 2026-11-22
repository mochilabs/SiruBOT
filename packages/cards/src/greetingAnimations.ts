/**
 * 인사 카드 레이어 움직임 — 프리셋(`GreetingAnimation`)을 CSS `@keyframes`와 `animation` 값으로 바꾸는 순수 함수예요 (node·브라우저 공용).
 *
 * 규칙:
 * - 모든 키프레임은 0% = 100%로 닫혀서 반복해도 끊기지 않아요.
 * - 회전은 항상 0%/50%/100% 3분할이에요 — 0°→360° 두 키프레임은 변환 행렬이 같아서 Takumi가 정지 프레임으로 그려요.
 * - 움직임은 레이어 바깥 래퍼에 입혀요(`greetingCard.ts`의 `withAnimation`). 레이어 자체의 회전·투명도와 곱해져요(대체하지 않아요).
 * - 카드 한 바퀴 길이 L(`greetingAnimationDurationMs`)이 정해지면 각 레이어 주기를 L의 약수(L / n)로 맞춰서 WebP가 끊김 없이 반복돼요.
 */
import { greetingAnimationDurationMs, type GreetingAnimation, type GreetingAnimationKind, type GreetingImage } from '@sirubot/utils/memberGreeting';

const round = (value: number): number => Math.round(value * 100) / 100;

/** intensity(0~1) → 종류별 키프레임 본문. 값은 px/deg/배율이에요. */
function keyframeStops(kind: GreetingAnimationKind, intensity: number): [string, string][] {
	const i = Math.min(1, Math.max(0, intensity));
	switch (kind) {
		case 'float': {
			const y = round(8 + 22 * i);
			return [
				['0%', 'transform: translateY(0px)'],
				['50%', `transform: translateY(${-y}px)`],
				['100%', 'transform: translateY(0px)']
			];
		}
		case 'drift': {
			const x = round(20 + 60 * i);
			const y = round(10 + 30 * i);
			return [
				['0%', 'transform: translate(0px, 0px)'],
				['50%', `transform: translate(${x}px, ${-y}px)`],
				['100%', 'transform: translate(0px, 0px)']
			];
		}
		case 'sway': {
			const deg = round(4 + 16 * i);
			return [
				['0%', `transform: rotate(${-deg}deg)`],
				['50%', `transform: rotate(${deg}deg)`],
				['100%', `transform: rotate(${-deg}deg)`]
			];
		}
		case 'spin':
			return [
				['0%', 'transform: rotate(0deg)'],
				['50%', 'transform: rotate(180deg)'],
				['100%', 'transform: rotate(360deg)']
			];
		case 'pulse': {
			const scale = round(1 + 0.03 + 0.09 * i);
			return [
				['0%', 'transform: scale(1)'],
				['50%', `transform: scale(${scale})`],
				['100%', 'transform: scale(1)']
			];
		}
		case 'twinkle': {
			const low = round(1 - (0.35 + 0.5 * i));
			return [
				['0%', 'opacity: 1'],
				['50%', `opacity: ${low}`],
				['100%', 'opacity: 1']
			];
		}
	}
}

/** 키프레임 이름 — (종류, 세기)가 같으면 같은 이름이라 CSS에 한 번만 들어가요. spin은 세기와 무관해요. */
export function animationName(animation: GreetingAnimation): string {
	const intensity = animation.type === 'spin' ? 0 : Math.round(animation.intensity * 100);
	return `ga-${animation.type}-${intensity}`;
}

/**
 * 한 바퀴 길이 loopMs 안에서 이 레이어의 주기 — 가장 가까운 약수(loopMs / n)로 맞춰요.
 * 예: 한 바퀴 4000ms에서 주기 1500ms → 4000 / round(4000 / 1500) = 4000 / 3 ≈ 1333ms.
 */
export function animationPeriodMs(animation: GreetingAnimation, loopMs: number): number {
	if (loopMs <= 0) return animation.durationMs;
	const n = Math.max(1, Math.round(loopMs / animation.durationMs));
	return round(loopMs / n);
}

/** CSS `animation` 값 — 시작 지연은 음수 지연(위상 어긋남)으로 줘서 처음 프레임부터 움직이는 상태이고 반복 경계가 끊기지 않아요. */
export function animationDeclaration(animation: GreetingAnimation, loopMs: number): string {
	const period = animationPeriodMs(animation, loopMs);
	const phase = round(animation.delayMs % period);
	const timing = animation.type === 'spin' ? 'linear' : 'ease-in-out';
	return `${animationName(animation)} ${period}ms ${timing} ${-phase}ms infinite`;
}

/** 카드에서 쓰는 움직임의 `@keyframes` 전부 — Takumi `css` 옵션에 그대로 넘겨요. 움직임이 없으면 빈 문자열이에요. */
export function greetingAnimationCss(image: GreetingImage): string {
	const seen = new Map<string, string>();
	for (const layer of image.layers) {
		if (layer.hidden || !layer.animation) continue;
		const name = animationName(layer.animation);
		if (seen.has(name)) continue;
		const stops = keyframeStops(layer.animation.type, layer.animation.intensity)
			.map(([offset, body]) => `${offset} { ${body}; }`)
			.join(' ');
		seen.set(name, `@keyframes ${name} { ${stops} }`);
	}
	return [...seen.values()].join('\n');
}

export { greetingAnimationDurationMs };
