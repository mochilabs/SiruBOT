import type { FastifyInstance } from "fastify";
import { getLogger } from "../utils/logger.ts";

const excludedRoutes = ["/api/health"];

export default async function auth(fastify: FastifyInstance) {
  const logger = getLogger("auth");
  const authKey = process.env.AUTH_KEY;

  if (!authKey) {
    logger.warn("AUTH_KEY is not set, auth will be disabled");
    return;
  }

  logger.info("AUTH_KEY is set, auth will be enabled");

  fastify.addHook("onRequest", async (request, reply) => {
    // Check if route is excluded
    if (excludedRoutes.some((route) => request.url.startsWith(route))) {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader || authHeader !== authKey) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  });
}
