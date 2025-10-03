import Fastify, { FastifyInstance } from "fastify";
import path from "path";
import AutoLoad from "@fastify/autoload";
import WebSocket from "@fastify/websocket";
import { getLogger } from "./utils/logger.ts";
import auth from "./plugins/auth.ts";

export class ShardManagerServer {
  private fastify: FastifyInstance;
  private logger: ReturnType<typeof getLogger>;
  private port: number = parseInt(process.env.PORT || "3001");
  private shardCount: number;

  constructor(shardCount: number) {
    this.fastify = Fastify({ logger: false });
    this.logger = getLogger("server");
    this.shardCount = shardCount;
  }

  public async setupRoutes() {
    // Global error handler
    this.fastify.setErrorHandler((error, request, reply) => {
      this.logger.error(
        { error, url: request.url, method: request.method },
        "Request error",
      );
      reply.status(error.statusCode ?? 500).send({
        error: error.message,
        statusCode: error.statusCode ?? 500,
      });
    });

    await auth(this.fastify);
    this.fastify.decorate("manager", this as any);
    await this.fastify.register(WebSocket);
    await this.fastify.register(AutoLoad, {
      dir: path.join(import.meta.dirname, "routes"),
      dirNameRoutePrefix: true,
      forceESM: true,
    });
  }

  public async start() {
    try {
      await this.fastify.listen({ port: this.port, host: "0.0.0.0" });
      this.logger.info(`🚀 서버가 포트 ${this.port}에서 시작되었습니다!`);
      this.logger.info(`📡 HTTP: http://localhost:${this.port}`);
      this.logger.info(`🌐 WebSocket: ws://localhost:${this.port}/ws`);
    } catch (error) {
      this.logger.error(error);
      process.exit(1);
    }
  }

  public async stop() {
    try {
      await this.fastify.close();
      this.logger.info("Server stopped gracefully");
    } catch (error) {
      this.logger.error(error);
    }
  }

  public getShardCount() {
    return this.shardCount;
  }
}
