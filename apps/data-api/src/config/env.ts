import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3002),
  REDIS_URL: z.string().optional(),
  AUTH_KEY: z.string().optional(),
  LOGLEVEL: z.string().default("info"),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  // 번역 프로바이더 (OpenAI 호환 엔드포인트). 없으면 원문 served + translated:false
  TRANSLATION_PROVIDER: z.string().default("openai"),
  OPENAI_COMPATIBLE_API_URL: z.string().default("http://127.0.0.1:8080/v1"),
  OPENAI_API_KEY: z.string().optional(),
  TRANSLATION_MODEL: z.string().default("default"),
  // 오하아사 일일 갱신 시각 (KST). '06:50' 형태
  OHAASA_REFRESH_AT: z.string().default("06:50"),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    console.error(result.error.format());
    process.exit(1);
  }
  return result.data;
}
