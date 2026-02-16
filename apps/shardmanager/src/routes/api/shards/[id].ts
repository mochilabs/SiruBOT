import type { FastifyInstance } from "fastify";

export default async function routes(fastify: FastifyInstance) {
  // GET /api/shards/:id - Get info for a specific shard
  fastify.get("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const shardId = parseInt(id, 10);

    if (isNaN(shardId)) {
      return reply.code(400).send({ error: "Invalid shard ID" });
    }

    const registry = fastify.manager.getRegistry();
    const process = registry.getProcessByShardId(shardId);

    if (!process) {
      return reply.code(404).send({ error: `Shard ${shardId} not found` });
    }

    return process;
  });
}
