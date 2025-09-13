import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import shardsRoutes from "./routes/api/test";

export class ShardManagerServer {
  private fastify;
  private port: number = parseInt(process.env.PORT || "3001");

  constructor() {
    this.fastify = Fastify({
      logger: {
        level: "info",
        // Pretty logging
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
          },
        },
      },
    });

    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupRoutes() {
    this.fastify.register(shardsRoutes);
  }

  private setupWebSocket() {
    this.fastify.register(fastifyWebsocket);

    this.fastify.register(async (fastify) => {
      fastify.get("/ws", { websocket: true }, (connection) => {
        connection.send("Hello world!");
        this.fastify.log.info("새로운 WebSocket 연결이 생성되었습니다.");
      });
    });
  }

  public async start() {
    try {
      await this.fastify.listen({ port: this.port, host: "0.0.0.0" });
      this.fastify.log.info(`🚀 서버가 포트 ${this.port}에서 시작되었습니다!`);
      this.fastify.log.info(`📡 HTTP: http://localhost:${this.port}`);
      this.fastify.log.info(`🌐 WebSocket: ws://localhost:${this.port}/ws`);
    } catch (error) {
      this.fastify.log.error(error);
      process.exit(1);
    }
  }

  public async stop() {
    try {
      await this.fastify.close();
      this.fastify.log.info("서버가 정상적으로 종료되었습니다.");
    } catch (error) {
      this.fastify.log.error(error);
    }
  }
}
