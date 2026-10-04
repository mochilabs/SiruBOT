import Fastify from "fastify";
import type { Env } from "./config/env.ts";
import auth from "./plugins/auth.ts";
import { sharedCache } from "./utils/cache.ts";
import { getLogger } from "./utils/logger.ts";
import { OpenAICompatTranslationProvider } from "./providers/translate.ts";
import { registerRoutes } from "./routes/index.ts";
import { startOhaasaScheduler } from "./services/ohaasaScheduler.ts";

export async function buildServer(env: Env) {
  const logger = getLogger("server");

  await sharedCache.connect(env.REDIS_URL);

  const translationProvider = new OpenAICompatTranslationProvider(
    env.OPENAI_COMPATIBLE_API_URL.replace(/\/+$/, ""),
    (env.OPENAI_API_KEY ?? "").trim(),
    env.TRANSLATION_MODEL,
  );
  if (!translationProvider.available) {
    logger.warn(
      "Translation provider not configured, serving raw horoscopes (translated:false)",
    );
  }

  const fastify = Fastify({
    logger: false,
    genReqId: () => crypto.randomUUID(),
  });
  fastify.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  await fastify.register(auth);
  await registerRoutes(fastify, { translationProvider });

  const stopScheduler = startOhaasaScheduler(env, translationProvider);

  const close = async () => {
    stopScheduler();
    await sharedCache.disconnect();
    await fastify.close();
  };

  return { fastify, close };
}
