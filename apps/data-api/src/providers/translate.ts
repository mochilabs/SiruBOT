import { getLogger } from "../utils/logger.ts";
import type { DailyHoroscope } from "./types.ts";

const logger = getLogger("translate");

export interface TranslationItem {
  zodiacCode: string;
  content: string;
  lucky: string;
}

/** 번역 프로바이더 추상화 — `TRANSLATION_PROVIDER`로 교체해요 (현재 openai만 구현). */
export interface TranslationProvider {
  readonly name: string;
  readonly available: boolean;
  translateHoroscope(
    items: TranslationItem[],
  ): Promise<Map<string, TranslationItem>>;
}

const TRANSLATE_SYSTEM_PROMPT = [
  "당신은 일본어 별자리 운세를 한국어로 번역하는 전문가예요.",
  "입력은 JSON 배열이고 각 항목의 zodiacCode, content(운세 본문), lucky(럭키 정보)를 담고 있어요.",
  "규칙:",
  '- content와 lucky만 자연스러운 한국어로 옮겨요. "~일 거예요", "~에 주의하세요" 같은 점괘 특유의 어조를 살려요.',
  '- lucky는 "럭키 컬러: 빨강 · 행운의 열쇠: 친구"처럼 정보를 빠짐없이 옮기되, 원문에 없는 항목을 만들지 않아요.',
  '- zodiacCode는 입력 그대로 되돌려요 (예: "01"). rank는 입력에 없으니 포함하지 않아요.',
  "- 원문에 없는 내용을 추가하지 않고, 빈 문자열은 빈 문자열로 둬요.",
  '- 출력은 [{"zodiacCode":"01","content":"...","lucky":"..."}, ...] 형태의 JSON 배열 하나만, 설명·마크다운 펜스 없이요.',
].join("\n");

function parseTranslation(text: string): Map<string, TranslationItem> | null {
  const stripped = text.replace(/```(?:json)?/gi, "").trim();
  const start = stripped.indexOf("[");
  const end = stripped.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  try {
    const arr: unknown = JSON.parse(stripped.slice(start, end + 1));
    if (!Array.isArray(arr)) return null;
    const map = new Map<string, TranslationItem>();
    for (const entry of arr) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as {
        zodiacCode?: unknown;
        content?: unknown;
        lucky?: unknown;
      };
      if (typeof e.zodiacCode !== "string") continue;
      const code = /^\d$/.test(e.zodiacCode)
        ? e.zodiacCode.padStart(2, "0")
        : e.zodiacCode;
      map.set(code, {
        zodiacCode: code,
        content: String(e.content ?? ""),
        lucky: String(e.lucky ?? ""),
      });
    }
    return map.size > 0 ? map : null;
  } catch {
    return null;
  }
}

export class OpenAICompatTranslationProvider implements TranslationProvider {
  public readonly name = "openai";
  public readonly available: boolean;

  public constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {
    this.available = apiKey.length > 0;
  }

  public async translateHoroscope(
    items: TranslationItem[],
  ): Promise<Map<string, TranslationItem>> {
    const res = await fetch(`${this.apiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: TRANSLATE_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(items) },
        ],
        stream: false,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`translation provider failed: ${res.status}`);
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content ?? "";
    const map = parseTranslation(content);
    if (!map) throw new Error("translation output is not valid JSON");
    return map;
  }
}

/** 번역본 조립 — 한 건이라도 성공하면 translated:true, 전부 실패 시 throw */
export async function translateDaily(
  raw: DailyHoroscope,
  provider: TranslationProvider,
): Promise<DailyHoroscope> {
  const items: TranslationItem[] = raw.horoscopes
    .filter((h) => h.content || h.lucky)
    .map((h) => ({
      zodiacCode: h.zodiacCode,
      content: h.content,
      lucky: h.lucky,
    }));
  if (items.length === 0) return raw;

  const map = await provider.translateHoroscope(items);
  let translatedCount = 0;
  const horoscopes = raw.horoscopes.map((h) => {
    const t = map.get(h.zodiacCode);
    if (!t) return h;
    translatedCount++;
    return { ...h, content: t.content || h.content, lucky: t.lucky || h.lucky };
  });
  if (translatedCount === 0) throw new Error("no items translated");
  logger.info(
    `translated ${translatedCount}/${raw.horoscopes.length} items via ${provider.name}`,
  );
  return { ...raw, horoscopes, translated: true };
}
