import type { FastifyInstance } from "fastify";

export default async function routes(fastify: FastifyInstance) {
  fastify.get("/count", async () => {
    return { count: fastify.manager.getShardCount() };
  });
}
