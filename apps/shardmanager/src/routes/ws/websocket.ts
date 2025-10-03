import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import {
  HelloPayload,
  WsMessage,
  WsMessageSchema,
  WsOp,
} from "@sirubot/shardclient/ws-types";
import { getLogger } from "../../utils/logger.ts";

function send<T>(socket: WebSocket, message: WsMessage<T>) {
  socket.send(JSON.stringify(message));
}

export default async function routes(fastify: FastifyInstance) {
  const logger = getLogger("websocket");
  fastify.get("/", { websocket: true }, (socket, _request) => {
    logger.info("WebSocket connection established");

    send<HelloPayload>(socket, {
      op: WsOp.HELLO,
      payload: {
        msg: "Hello, world!",
      },
    });

    socket.on("message", (message) => {
      logger.info("WebSocket message received: ", message.toString());
      try {
        const parsedMessage = WsMessageSchema.parse(
          JSON.parse(message.toString()),
        );
        logger.info("WebSocket message parsed: ", parsedMessage);
      } catch (error: unknown) {
        if (error instanceof Error) {
          send<HelloPayload>(socket, {
            op: WsOp.HELLO,
            payload: {
              msg: error.message,
            },
          });
        }
        logger.error("WebSocket message parsing error:", error);
      }
    });

    socket.on("close", () => {
      logger.info("WebSocket connection closed");
    });

    socket.on("error", (error) => {
      logger.error("WebSocket error:", error);
    });
  });
}
