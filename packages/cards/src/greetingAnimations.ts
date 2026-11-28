import { greetingAnimationDurationMs, type GreetingAnimation, type GreetingAnimationKind, type GreetingImage } from '@sirubot/utils/memberGreeting';

const round = (value: number): number => Math.round(value * 100) / 100;

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
		// 0/50/100% needed: Takumi treats 0°→360° as identical matrices (still frame).
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

export function animationName(animation: GreetingAnimation): string {
	const intensity = animation.type === 'spin' ? 0 : Math.round(animation.intensity * 100);
	return `ga-${animation.type}-${intensity}`;
}

export function animationPeriodMs(animation: GreetingAnimation, loopMs: number): number {
	if (loopMs <= 0) return animation.durationMs;
	const n = Math.max(1, Math.round(loopMs / animation.durationMs));
	return round(loopMs / n);
}

/** A negative delay offsets the phase so the first frame is already in motion and the loop boundary stays seamless. */
export function animationDeclaration(animation: GreetingAnimation, loopMs: number): string {
	const period = animationPeriodMs(animation, loopMs);
	const phase = round(animation.delayMs % period);
	const timing = animation.type === 'spin' ? 'linear' : 'ease-in-out';
	return `${animationName(animation)} ${period}ms ${timing} ${-phase}ms infinite`;
}

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
