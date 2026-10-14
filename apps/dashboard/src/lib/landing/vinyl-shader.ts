/**
 * SiruBot(시루봇) — M3 턴테이블 부조 셰이더 배경 런타임 (의존성 없는 원시 WebGL 구현)
 *
 * 디자인 프리뷰(three.js 기반 SiruBotThreeBackground)를 의존성 없이 이식했어요.
 * - 프래그먼트 셰이더는 프리뷰와 동일한 GLSL ES 1.00 소스를 유지해요. 유일한 차이는
 *   하드코딩 팔레트 7종을 유니폼으로 올린 것(uBgBase/uSurf0~3/uSurfRose/uPink)으로,
 *   다크·라이트 재색조를 런타임에서 스왑하기 위해서예요. 프리뷰를 수정할 때는
 *   팔레트 블록만 그대로 유지하면 소스 전체를 복붙 교체할 수 있어요.
 * - 버텍스 셰이더는 three.PlaneGeometry(2,2) 대신 풀스크린 쿼드 1개(TRIANGLE_STRIP)로 대체했어요.
 * - 컨텍스트는 webgl2 → webgl 순으로 시도해요. ES 1.00 소스는 WebGL2에서도 역호환돼요.
 * - 4번('minimal') 플래터는 랜딩에서 고정이지만, 나머지 스타일 전환은
 *   /design 놀이터 확장에 대비해 setPlatterStyle API를 유지해요.
 *
 * 성능 계약:
 * - rAF 루프는 document.hidden에서 정지하고, reduced-motion에서는 루프 없이 정지 프레임 1장만 렌더해요.
 * - 컨텍스트 상실(webglcontextlost) 시 루프를 정지해 콘솔 에러를 내지 않아요.
 *   폴백 시 보이는 body 배경색과 팔레트 bgBase가 동일하기 때문에 시각적으로 튀지 않아요.
 */

const VERTEX_SHADER = /* glsl */ `
attribute vec2 aVertex;
attribute vec2 aUv;
varying vec2 vUv;

void main() {
	vUv = aUv;
	gl_Position = vec4(aVertex, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec2 uMouse;
  uniform int uPlatterStyle;

  // 재색조 — 팔레트 7종은 TS 쪽 VINYL_PALETTES에서 유니폼으로 공급해요.
  uniform vec3 uBgBase;
  uniform vec3 uSurf0;
  uniform vec3 uSurf1;
  uniform vec3 uSurf2;
  uniform vec3 uSurf3;
  uniform vec3 uSurfRose;
  uniform vec3 uPink;

  varying vec2 vUv;

  #define PI 3.14159265359

  mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
  }

  // Exact M3 Superellipse / Squircle SDF
  float sdSquircle(vec2 p, float rad, float rot) {
    vec2 q = rot2D(rot) * p;
    float r = length(q);
    float a = atan(q.y, q.x);
    float ca = abs(cos(a));
    float sa = abs(sin(a));
    float denom = pow(pow(ca, 4.2) + pow(sa, 4.2), 1.0 / 4.2);
    float rb = (rad * 0.92) / max(0.0001, denom);
    return r - rb;
  }

  // M3 Lobed Cookie / Clover Polar SDF
  float sdPolarLobe(vec2 p, float rad, float lobes, float amp, float baseScale, float rot) {
    vec2 q = rot2D(rot) * p;
    float r = length(q);
    float a = atan(q.y, q.x);
    float rb = rad * (baseScale + amp * cos(lobes * a));
    return r - rb;
  }

  // Exact 2D Capsule / Pill Segment SDF from A to B
  float sdSegment(vec2 p, vec2 a, vec2 b, float r) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(0.0001, dot(ba, ba)), 0.0, 1.0);
    return length(pa - ba * h) - r;
  }

  // Composites a 2.5D M3 Bas-Relief layer onto col with drop shadow, matte gradient, inner bevel, and 1px specular rim
  void compositeRelief(
    inout vec3 col,
    vec2 p,
    vec2 center,
    float sdf,
    float sdfShadow,
    float approxRad,
    vec3 fillCol,
    vec3 rimCol,
    float rimStrength,
    float shadowStrength,
    float spotBoost
  ) {
    float sh = clamp(1.0 - max(0.0, sdfShadow) / 0.075, 0.0, 1.0) * step(0.0, sdf);
    col *= (1.0 - sh * shadowStrength);

    float aa = 2.2 / uResolution.y;
    float inside = clamp(0.5 - sdf / aa, 0.0, 1.0);

    vec2 d = p - center;
    float surfGrad = clamp((-d.x * 0.7 + d.y * 0.7) / max(0.12, approxRad), -1.0, 1.0);
    float bevel = exp(-abs(sdf + 0.007) / 0.009) * inside;
    float edge = exp(-(sdf * sdf) / (0.0026 * 0.0026));

    float worldAng = atan(d.y, d.x);
    float lightMask = clamp(0.42 + 0.65 * cos(worldAng - 2.35), 0.15, 1.0);
    float effRim = rimStrength * (1.0 + spotBoost * 0.65);

    vec3 surfCol = fillCol * (1.0 + 0.055 * surfGrad);
    surfCol += rimCol * (bevel * lightMask * 0.09);

    col = mix(col, surfCol, inside);
    col += rimCol * (edge * lightMask * effRim);
  }

  void drawHairlineRing(
    inout vec3 col,
    vec2 p,
    vec2 center,
    float rad,
    vec3 ringCol,
    float opacity,
    float nDash,
    float rot
  ) {
    vec2 d = p - center;
    float r = length(d);
    float a = atan(d.y, d.x) + rot;
    float line = exp(-((r - rad) * (r - rad)) / (0.0022 * 0.0022));
    if (nDash > 0.5) {
      line *= clamp(sin(a * nDash) * 3.0, 0.0, 1.0);
    }
    col += ringCol * (line * opacity);
  }

  float hashGrain(vec2 uv) {
    return fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453) * 2.0 - 1.0;
  }

  void main() {
    float aspect = uResolution.x / max(1.0, uResolution.y);
    vec2 p = (vUv - 0.5) * 2.0;
    p.x *= aspect;

    vec2 m = uMouse;
    m.x *= aspect;

    // SiruBot Tonal Palette — 아래 7개 변수에만 유니폼 값을 대입해요(이름 유지로 셰이더 본문은 프리뷰와 동일).
    vec3 bgBase   = uBgBase;
    vec3 surf0    = uSurf0;
    vec3 surf1    = uSurf1;
    vec3 surf2    = uSurf2;
    vec3 surf3    = uSurf3;
    vec3 surfRose = uSurfRose;
    vec3 pink     = uPink;

    vec3 col = bgBase;

    // Ambient spotlight pools + interactive mouse spotlight
    float dRight = length(p - vec2(1.25, -0.08));
    float dTL    = length(p - vec2(-1.58, 0.56));
    float dMouse = length(p - m);
    float mouseSpot = exp(-dMouse * dMouse * 2.2);
    float spot = exp(-dRight * dRight * 1.1) * 0.48 + exp(-dTL * dTL * 1.8) * 0.35 + mouseSpot * 0.55;

    col += (pink * 0.10) * spot;

    // Architectural Hairline Grid + Intersection Micro-Dots
    float gridSize = 0.22;
    vec2 g = abs(mod(p + gridSize * 0.5, gridSize) - gridSize * 0.5);
    float gridLine = clamp(1.0 - min(g.x, g.y) / 0.0028, 0.0, 1.0);
    float gridDot  = clamp(1.0 - length(g) / 0.0085, 0.0, 1.0);
    col += pink * ((gridLine * 0.020 + gridDot * 0.055) * (0.32 + 0.88 * spot));

    vec2 par1 = m * 0.025;
    vec2 par2 = m * 0.045;
    vec2 shOff = vec2(0.022, -0.032);

    // =========================================================================
    // 1. TOP-LEFT SQUIRCLE (Inner shape removed as requested!)
    // =========================================================================
    vec2 cTL = vec2(-1.58, 0.56) + par1;
    drawHairlineRing(col, p, cTL, 0.33, pink, 0.08 + 0.04 * mouseSpot, 48.0, uTime * 0.08);
    {
      float d1 = sdSquircle(p - cTL, 0.23, 0.42 + uTime * 0.05);
      float s1 = sdSquircle(p - shOff - cTL, 0.23, 0.42 + uTime * 0.05);
      compositeRelief(col, p, cTL, d1, s1, 0.23, surf2, pink, 0.28, 0.36, mouseSpot);
    }

    // =========================================================================
    // 2. BOTTOM-LEFT & TOP-CENTER PERIPHERAL M3 TOKENS
    // =========================================================================
    vec2 cBL = vec2(-1.40, -0.56) + par1;
    {
      float d1 = sdPolarLobe(p - cBL, 0.21, 8.0, 0.08, 0.94, 0.15 - uTime * 0.07);
      float s1 = sdPolarLobe(p - shOff - cBL, 0.21, 8.0, 0.08, 0.94, 0.15 - uTime * 0.07);
      compositeRelief(col, p, cBL, d1, s1, 0.21, surf1, pink, 0.22, 0.34, mouseSpot);

      vec2 pA = vec2(-1.00, -0.79) + par2;
      vec2 pB = vec2(-0.80, -0.70) + par2;
      float d2 = sdSegment(p, pA, pB, 0.050);
      float s2 = sdSegment(p - shOff, pA, pB, 0.050);
      compositeRelief(col, p, 0.5 * (pA + pB), d2, s2, 0.12, surf2, pink, 0.26, 0.30, mouseSpot);
    }

    vec2 cTC = vec2(0.28, 0.68) + par2;
    {
      float d1 = sdPolarLobe(p - cTC, 0.125, 4.0, 0.14, 0.88, 0.30 + uTime * 0.10);
      float s1 = sdPolarLobe(p - shOff - cTC, 0.125, 4.0, 0.14, 0.88, 0.30 + uTime * 0.10);
      compositeRelief(col, p, cTC, d1, s1, 0.125, surf1, pink, 0.22, 0.30, mouseSpot);
    }

    // =========================================================================
    // 3. RIGHT SIDE: M3 TURNTABLE BAS-RELIEF (WITH PLATTER VARIATIONS)
    // =========================================================================
    vec2 tCenter = vec2(1.25, -0.08) + par1;
    vec2 pCenter = tCenter + vec2(-0.08, 0.0);

    // Outer Squircle Plinth
    float dPlinth = sdSquircle(p - tCenter, 0.75, 0.16);
    float sPlinth = sdSquircle(p - shOff - tCenter, 0.75, 0.16);
    compositeRelief(col, p, tCenter, dPlinth, sPlinth, 0.75, surf1, pink, 0.24, 0.42, mouseSpot);

    // Rotating Strobe Hairline Ring
    float platRot = -uTime * 0.35;
    drawHairlineRing(col, p, pCenter, 0.54, pink, 0.11, 72.0, platRot * 0.5);

    if (uPlatterStyle == 0) {
      // STYLE 0 ('circle'): Clean Circular Platter Rim + Deep Vinyl LP + Clean Circular Label
      float dPlat = length(p - pCenter) - 0.485;
      float sPlat = length(p - shOff - pCenter) - 0.485;
      compositeRelief(col, p, pCenter, dPlat, sPlat, 0.485, surf2, pink, 0.28, 0.36, mouseSpot);

      float dVinyl = length(p - pCenter) - 0.435;
      float sVinyl = length(p - shOff - pCenter) - 0.435;
      compositeRelief(col, p, pCenter, dVinyl, sVinyl, 0.435, surf0, pink, 0.20, 0.25, mouseSpot);

      drawHairlineRing(col, p, pCenter, 0.365, pink, 0.07, 0.0, 0.0);
      drawHairlineRing(col, p, pCenter, 0.295, pink, 0.09, 36.0, platRot * 1.4);
      drawHairlineRing(col, p, pCenter, 0.225, pink, 0.07, 0.0, 0.0);

      float dLabel = length(p - pCenter) - 0.140;
      float sLabel = length(p - shOff - pCenter) - 0.140;
      compositeRelief(col, p, pCenter, dLabel, sLabel, 0.140, surfRose, pink, 0.38, 0.25, mouseSpot);

      drawHairlineRing(col, p, pCenter, 0.088, pink, 0.16, 12.0, platRot);
    } else if (uPlatterStyle == 1) {
      // STYLE 1 ('circle-clover'): Clean Circular Platter Rim + M3 4-Leaf Clover Label
      float dPlat = length(p - pCenter) - 0.485;
      float sPlat = length(p - shOff - pCenter) - 0.485;
      compositeRelief(col, p, pCenter, dPlat, sPlat, 0.485, surf2, pink, 0.28, 0.36, mouseSpot);

      float dVinyl = length(p - pCenter) - 0.435;
      float sVinyl = length(p - shOff - pCenter) - 0.435;
      compositeRelief(col, p, pCenter, dVinyl, sVinyl, 0.435, surf0, pink, 0.20, 0.25, mouseSpot);

      drawHairlineRing(col, p, pCenter, 0.365, pink, 0.07, 0.0, 0.0);
      drawHairlineRing(col, p, pCenter, 0.295, pink, 0.09, 36.0, platRot * 1.4);
      drawHairlineRing(col, p, pCenter, 0.225, pink, 0.07, 0.0, 0.0);

      float dLabel = sdPolarLobe(p - pCenter, 0.142, 4.0, 0.14, 0.88, platRot);
      float sLabel = sdPolarLobe(p - shOff - pCenter, 0.142, 4.0, 0.14, 0.88, platRot);
      compositeRelief(col, p, pCenter, dLabel, sLabel, 0.142, surfRose, pink, 0.38, 0.25, mouseSpot);
    } else if (uPlatterStyle == 2) {
      // STYLE 2 ('equalizer'): Circular Vinyl Platter with Radial Equalizer Capsules
      float dPlat = length(p - pCenter) - 0.485;
      float sPlat = length(p - shOff - pCenter) - 0.485;
      compositeRelief(col, p, pCenter, dPlat, sPlat, 0.485, surf0, pink, 0.24, 0.36, mouseSpot);

      vec2 q = p - pCenter;
      float r = length(q);
      float a = atan(q.y, q.x) - platRot * 0.5;
      float sectors = 20.0;
      float sectorAngle = (2.0 * PI) / sectors;
      float id = floor((a + PI) / sectorAngle);
      float aLocal = mod(a + PI, sectorAngle) - sectorAngle * 0.5;
      vec2 qLocal = vec2(r * cos(aLocal), r * sin(aLocal));

      float wave = 0.055 * sin(id * 1.7 + uTime * 3.0) + 0.035 * cos(id * 2.3 - uTime * 2.1);
      float dCaps = sdSegment(qLocal, vec2(0.22, 0.0), vec2(0.36 + wave, 0.0), 0.022);
      compositeRelief(col, p, pCenter, dCaps, dCaps + 0.01, 0.40, surfRose, pink, 0.34, 0.20, mouseSpot);

      float dLabel = length(p - pCenter) - 0.135;
      float sLabel = length(p - shOff - pCenter) - 0.135;
      compositeRelief(col, p, pCenter, dLabel, sLabel, 0.135, surf2, pink, 0.36, 0.25, mouseSpot);
    } else {
      // STYLE 3 ('minimal'): Minimalist Single-Tier Grooved Vinyl Disc + Squircle Label
      float dVinyl = length(p - pCenter) - 0.475;
      float sVinyl = length(p - shOff - pCenter) - 0.475;
      compositeRelief(col, p, pCenter, dVinyl, sVinyl, 0.475, surf0, pink, 0.26, 0.36, mouseSpot);

      drawHairlineRing(col, p, pCenter, 0.39, pink, 0.08, 0.0, 0.0);
      drawHairlineRing(col, p, pCenter, 0.31, pink, 0.08, 0.0, 0.0);
      drawHairlineRing(col, p, pCenter, 0.23, pink, 0.08, 0.0, 0.0);

      float dLabel = sdSquircle(p - pCenter, 0.140, platRot);
      float sLabel = sdSquircle(p - shOff - pCenter, 0.140, platRot);
      compositeRelief(col, p, pCenter, dLabel, sLabel, 0.140, surfRose, pink, 0.38, 0.25, mouseSpot);
    }

    // Center Spindle Pin
    float dSpindle = length(p - pCenter) - 0.038;
    float sSpindle = length(p - shOff - pCenter) - 0.038;
    compositeRelief(col, p, pCenter, dSpindle, sSpindle, 0.038, surf3, pink, 0.42, 0.20, mouseSpot);

    // Tonearm Assembly (8-Lobe Cookie Base + Capsule Arm + Squircle Headshell)
    vec2 armA = tCenter + vec2(0.43, 0.35);
    float armSwing = sin(uTime * 0.8) * 0.015;
    vec2 armB = tCenter + vec2(0.17 + armSwing, -0.20);

    float dBase = sdPolarLobe(p - armA, 0.142, 8.0, 0.08, 0.94, 0.20);
    float sBase = sdPolarLobe(p - shOff - armA, 0.142, 8.0, 0.08, 0.94, 0.20);
    compositeRelief(col, p, armA, dBase, sBase, 0.142, surf2, pink, 0.28, 0.32, mouseSpot);

    float dTube = sdSegment(p, armA, armB, 0.046);
    float sTube = sdSegment(p - shOff, armA, armB, 0.046);
    compositeRelief(col, p, 0.5 * (armA + armB), dTube, sTube, 0.28, surf3, pink, 0.34, 0.35, mouseSpot);

    float dPivotCap = length(p - armA) - 0.062;
    float sPivotCap = length(p - shOff - armA) - 0.062;
    compositeRelief(col, p, armA, dPivotCap, sPivotCap, 0.062, surfRose, pink, 0.36, 0.22, mouseSpot);

    float dHead = sdSquircle(p - armB, 0.074, 0.42);
    float sHead = sdSquircle(p - shOff - armB, 0.074, 0.42);
    compositeRelief(col, p, armB, dHead, sHead, 0.074, surfRose, pink, 0.38, 0.28, mouseSpot);

    // Start/Stop Squircle Button & Pitch Capsule Slot on Plinth
    vec2 btnC = tCenter + vec2(-0.51, -0.47);
    float dBtn = sdSquircle(p - btnC, 0.070, 0.16);
    float sBtn = sdSquircle(p - shOff - btnC, 0.070, 0.16);
    compositeRelief(col, p, btnC, dBtn, sBtn, 0.070, surfRose, pink, 0.36, 0.22, mouseSpot);

    vec2 faderA = tCenter + vec2(0.47, -0.41);
    vec2 faderB = tCenter + vec2(0.52, -0.17);
    float dFader = sdSegment(p, faderA, faderB, 0.030);
    float sFader = sdSegment(p - shOff, faderA, faderB, 0.030);
    compositeRelief(col, p, 0.5 * (faderA + faderB), dFader, sFader, 0.12, surf2, pink, 0.28, 0.20, mouseSpot);

    col += hashGrain(vUv * uResolution) * 0.008;

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

const PLATTER_STYLE_MAP = {
	circle: 0,
	"circle-clover": 1,
	equalizer: 2,
	minimal: 3,
} as const;

export type VinylPlatterStyle = keyof typeof PLATTER_STYLE_MAP;

export interface VinylPalette {
	/** 캔버스 외곽 배경 — body 배경(--background)과 반드시 동일해야 FOUC·폴백에 시각적 튐이 없어요 */
	readonly bgBase: string;
	/** 비닐 심부 표면 (다크 #1b1315 / 라이트는 마룬 — 라이트에서도 레코드 판은 어둡게 유지) */
	readonly surf0: string;
	/** 플린스(외곽 베이스) 등 컨테이너 low */
	readonly surf1: string;
	/** 컨테이너 mid */
	readonly surf2: string;
	/** 컨테이너 high (스핀들·토너암 축) */
	readonly surf3: string;
	/** 라벨·버튼 등 primary container */
	readonly surfRose: string;
	/** 림 하이라이트·헤어라인 그리드·스포트라이트 공용 액센트 */
	readonly accent: string;
}

/**
 * 테마별 셰이더 팔레트.
 * 다크는 디자인 프리뷰의 원본 값이고, 라이트는 `globals.css`의 라이트 토큰(#fff9f9 배경·#ffdada primary·#ee6f8b brand)에서 유도했어요.
 * 다크 bgBase는 `.dark --background`, 라이트 bgBase는 라이트 `--background`와 동일해야 해요 — 어느 쪽 바꿀 때 쌍으로 갱신할 것.
 */
export const VINYL_PALETTES = {
	dark: {
		bgBase: "#1f1618",
		surf0: "#1b1315",
		surf1: "#251a1d",
		surf2: "#2d2023",
		surf3: "#36262a",
		surfRose: "#46262f",
		accent: "#f98aa0",
	},
	light: {
		bgBase: "#fff9f9",
		surf0: "#4f1c2a",
		surf1: "#ffefee",
		surf2: "#ffe2e2",
		surf3: "#ffc9cd",
		surfRose: "#ee6f8b",
		accent: "#ee6f8b",
	},
} as const satisfies Record<string, VinylPalette>;

export interface VinylShaderOptions {
	/** 플래터 스타일 (랜딩은 'minimal' = 4번 고정) */
	readonly platterStyle?: VinylPlatterStyle;
	/** 초기 팔레트 */
	readonly palette: VinylPalette;
	/** 애니메이션 배속 (기본 1) */
	readonly speed?: number;
	/** reduced-motion: 루프·입력 리스너 없이 정지 프레임 1장만 렌더 */
	readonly reducedMotion?: boolean;
	/** 픽셀비 상한. 기본은 데스크탑 2, coarse 포인터(터치) 기기 1.5 */
	readonly dprCap?: number;
}

export interface VinylShaderHandle {
	setPlatterStyle(style: VinylPlatterStyle): void;
	setPalette(palette: VinylPalette): void;
	setSpeed(speed: number): void;
	dispose(): void;
}

type WebGLContext = WebGLRenderingContext | WebGL2RenderingContext;

function hexToNormalizedRgb(hex: string): [number, number, number] {
	const value = hex.replace(/^#/, "");
	const full = value.length === 3 ? value.split("").map((char) => char + char).join("") : value;
	return [
		Number.parseInt(full.slice(0, 2), 16) / 255,
		Number.parseInt(full.slice(2, 4), 16) / 255,
		Number.parseInt(full.slice(4, 6), 16) / 255,
	];
}

function paletteToFloatArrays(palette: VinylPalette): Record<keyof VinylPalette, Float32Array> {
	return {
		bgBase: new Float32Array(hexToNormalizedRgb(palette.bgBase)),
		surf0: new Float32Array(hexToNormalizedRgb(palette.surf0)),
		surf1: new Float32Array(hexToNormalizedRgb(palette.surf1)),
		surf2: new Float32Array(hexToNormalizedRgb(palette.surf2)),
		surf3: new Float32Array(hexToNormalizedRgb(palette.surf3)),
		surfRose: new Float32Array(hexToNormalizedRgb(palette.surfRose)),
		accent: new Float32Array(hexToNormalizedRgb(palette.accent)),
	};
}

function compileShader(gl: WebGLContext, type: number, source: string, label: string): WebGLShader | null {
	const shader = gl.createShader(type);
	if (!shader) return null;
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		console.error(`[vinyl-shader] ${label} 컴파 실패:`, gl.getShaderInfoLog(shader));
		gl.deleteShader(shader);
		return null;
	}
	return shader;
}

/**
 * 랜딩 배경 셰이더를 만들고 container 안에 캔버스를 붙여요.
 * WebGL 미지원·컨텍스트 생성 실패·셰이더 컴파일 실패 시 null을 반환해요(호출부는 조용히 폴백하면 됨).
 */
export function createVinylShaderBackground(container: HTMLElement, options: VinylShaderOptions): VinylShaderHandle | null {
	if (typeof window === "undefined") return null;

	const canvas = document.createElement("canvas");
	canvas.style.cssText = "display:block;width:100%;height:100%;";

	const contextAttributes: WebGLContextAttributes = {
		alpha: false,
		antialias: false,
		depth: false,
		stencil: false,
		powerPreference: "high-performance",
	};
	const gl = (canvas.getContext("webgl2", contextAttributes) ?? canvas.getContext("webgl", contextAttributes)) as WebGLContext | null;
	if (!gl) return null;

	const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER, "버텍스 셰이더");
	const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER, "프래그먼트 셰이더");
	if (!vertexShader || !fragmentShader) {
		if (vertexShader) gl.deleteShader(vertexShader);
		if (fragmentShader) gl.deleteShader(fragmentShader);
		return null;
	}

	const program = gl.createProgram();
	if (!program) {
		gl.deleteShader(vertexShader);
		gl.deleteShader(fragmentShader);
		return null;
	}
	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);
	gl.deleteShader(vertexShader);
	gl.deleteShader(fragmentShader);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		console.error("[vinyl-shader] 프로그램 링크 실패:", gl.getProgramInfoLog(program));
		gl.deleteProgram(program);
		return null;
	}

	gl.useProgram(program);

	// 풀스크린 쿼드 (TRIANGLE_STRIP: 좌하 → 우하 → 좌상 → 우상)
	const quadBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
	gl.bufferData(
		gl.ARRAY_BUFFER,
		new Float32Array([
			-1, -1, 0, 0,
			1, -1, 1, 0,
			-1, 1, 0, 1,
			1, 1, 1, 1,
		]),
		gl.STATIC_DRAW,
	);
	const positionAttribute = gl.getAttribLocation(program, "aVertex");
	const uvAttribute = gl.getAttribLocation(program, "aUv");
	if (positionAttribute >= 0) {
		gl.enableVertexAttribArray(positionAttribute);
		gl.vertexAttribPointer(positionAttribute, 2, gl.FLOAT, false, 16, 0);
	}
	if (uvAttribute >= 0) {
		gl.enableVertexAttribArray(uvAttribute);
		gl.vertexAttribPointer(uvAttribute, 2, gl.FLOAT, false, 16, 8);
	}

	const locations = {
		time: gl.getUniformLocation(program, "uTime"),
		resolution: gl.getUniformLocation(program, "uResolution"),
		mouse: gl.getUniformLocation(program, "uMouse"),
		platterStyle: gl.getUniformLocation(program, "uPlatterStyle"),
		bgBase: gl.getUniformLocation(program, "uBgBase"),
		surf0: gl.getUniformLocation(program, "uSurf0"),
		surf1: gl.getUniformLocation(program, "uSurf1"),
		surf2: gl.getUniformLocation(program, "uSurf2"),
		surf3: gl.getUniformLocation(program, "uSurf3"),
		surfRose: gl.getUniformLocation(program, "uSurfRose"),
		accent: gl.getUniformLocation(program, "uPink"),
	};

	const dprCap = options.dprCap ?? (window.matchMedia("(pointer: coarse)").matches ? 1.5 : 2);
	let speed = options.speed ?? 1.0;
	let elapsed = 0;
	let platterStyle = PLATTER_STYLE_MAP[options.platterStyle ?? "circle"];
	let paletteArrays = paletteToFloatArrays(options.palette);

	const applyPaletteUniforms = () => {
		gl.uniform3fv(locations.bgBase, paletteArrays.bgBase);
		gl.uniform3fv(locations.surf0, paletteArrays.surf0);
		gl.uniform3fv(locations.surf1, paletteArrays.surf1);
		gl.uniform3fv(locations.surf2, paletteArrays.surf2);
		gl.uniform3fv(locations.surf3, paletteArrays.surf3);
		gl.uniform3fv(locations.surfRose, paletteArrays.surfRose);
		gl.uniform3fv(locations.accent, paletteArrays.accent);
	};
	applyPaletteUniforms();
	if (locations.platterStyle) gl.uniform1i(locations.platterStyle, platterStyle);

	// 캔버스 실크 스무딩 — 프리뷰 동일 스펙(stiffness 85 / damping 13)
	let targetX = 0.4;
	let targetY = 0.0;
	let currentX = 0.4;
	let currentY = 0.0;
	let velocityX = 0.0;
	let velocityY = 0.0;

	container.appendChild(canvas);

	let rafId: number | null = null;
	let lastFrameTime: number | null = null;
	let contextLost = false;
	const reducedMotion = options.reducedMotion ?? false;

	const resize = () => {
		const width = container.clientWidth || window.innerWidth;
		const height = container.clientHeight || window.innerHeight;
		const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
		canvas.width = Math.max(1, Math.round(width * dpr));
		canvas.height = Math.max(1, Math.round(height * dpr));
		gl.viewport(0, 0, canvas.width, canvas.height);
		if (locations.resolution) gl.uniform2f(locations.resolution, canvas.width, canvas.height);
	};

	const renderFrame = () => {
		gl.uniform1f(locations.time, elapsed);
		gl.uniform2f(locations.mouse, currentX, currentY);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	};

	const frame = (now: number) => {
		rafId = requestAnimationFrame(frame);
		const deltaTime = lastFrameTime === null ? 0 : Math.min(0.05, (now - lastFrameTime) / 1000);
		lastFrameTime = now;
		elapsed += deltaTime * speed;

		velocityX += ((targetX - currentX) * 85.0 - velocityX * 13.0) * deltaTime;
		velocityY += ((targetY - currentY) * 85.0 - velocityY * 13.0) * deltaTime;
		currentX += velocityX * deltaTime;
		currentY += velocityY * deltaTime;

		renderFrame();
	};

	const startLoop = () => {
		if (rafId !== null || reducedMotion || contextLost) return;
		lastFrameTime = null;
		rafId = requestAnimationFrame(frame);
	};

	const stopLoop = () => {
		if (rafId === null) return;
		cancelAnimationFrame(rafId);
		rafId = null;
	};

	const onPointerMove = (event: PointerEvent) => {
		targetX = (event.clientX / window.innerWidth - 0.5) * 2.0;
		targetY = (0.5 - event.clientY / window.innerHeight) * 2.0;
	};

	const onResize = () => resize();

	const onVisibilityChange = () => {
		if (document.hidden) {
			stopLoop();
		} else {
			startLoop();
		}
	};

	const onWebGLContextLost = (event: Event) => {
		event.preventDefault();
		contextLost = true;
		stopLoop();
	};

	resize();

	if (reducedMotion) {
		// 정지 프레임 1장만 렌더 — 리스너·루프 없음
		renderFrame();
	} else {
		window.addEventListener("pointermove", onPointerMove, { passive: true });
		document.addEventListener("visibilitychange", onVisibilityChange);
		startLoop();
	}
	window.addEventListener("resize", onResize);
	canvas.addEventListener("webglcontextlost", onWebGLContextLost);

	return {
		setPlatterStyle(style) {
			platterStyle = PLATTER_STYLE_MAP[style];
			if (locations.platterStyle) gl.uniform1i(locations.platterStyle, platterStyle);
		},
		setPalette(palette) {
			paletteArrays = paletteToFloatArrays(palette);
			applyPaletteUniforms();
		},
		setSpeed(nextSpeed) {
			speed = nextSpeed;
		},
		dispose() {
			stopLoop();
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("resize", onResize);
			document.removeEventListener("visibilitychange", onVisibilityChange);
			canvas.removeEventListener("webglcontextlost", onWebGLContextLost);
			if (quadBuffer) gl.deleteBuffer(quadBuffer);
			gl.deleteProgram(program);
			// GPU 컨텍스트를 명시적으로 해제해 메모리를 즉시 돌려줘요
			(gl.getExtension("WEBGL_lose_context") as { loseContext(): void } | null)?.loseContext();
			canvas.remove();
		},
	};
}