import type { FastifyInstance } from "fastify";

export default async function routes(fastify: FastifyInstance) {
  fastify.get("/:id", async (req) => {
    const { id } = req.params as { id: string };
    const shardCount = fastify.manager.getShardCount();
    return { id, shardCount };
  });
}
