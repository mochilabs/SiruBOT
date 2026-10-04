import type { FastifyInstance } from "fastify";
import { getLogger } from "../utils/logger.ts";

const logger = getLogger("auth");
const excludedPrefixes = ["/api/health"];

export default async function auth(fastify: FastifyInstance): Promise<void> {
  const authKey = process.env.AUTH_KEY;
  if (!authKey) {
    logger.warn("AUTH_KEY is not set, auth will be disabled");
    return;
  }
  logger.info("AUTH_KEY is set, auth will be enabled");
  fastify.addHook("onRequest", async (request, reply) => {
    if (excludedPrefixes.some((prefix) => request.url.startsWith(prefix)))
      return;
    if (request.headers.authorization !== authKey) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  });
}
