import "fastify";
import type { ShardManagerServer } from "../server";

declare module "fastify" {
  interface FastifyInstance {
    manager: ShardManagerServer;
  }
}
