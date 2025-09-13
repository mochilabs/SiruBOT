import { ILogger } from "./types/logger";
import { Websocket, WebsocketOptions } from "./core/ws";
import { ShardClientError } from "./errors/ShardClientError";

export type ShardClientOptions = {
  logger: ILogger;
  webSocketOptions: Omit<WebsocketOptions, "logger">;
};

export class ShardClient {
  private readonly logger: ILogger;
  private readonly ws: Websocket;

  #shardId: number;
  #shardCount: number;

  constructor({ logger, webSocketOptions }: ShardClientOptions) {
    if (typeof logger !== "function")
      throw new ShardClientError("logger must be a function");
    if (typeof webSocketOptions !== "object")
      throw new ShardClientError("webSocketOptions must be an object");
    if (typeof webSocketOptions.serverURL !== "string")
      throw new ShardClientError("webSocketOptions.serverURL must be a string");
    this.#shardId = 0;
    this.#shardCount = 0;

    this.logger = logger;
    this.ws = new Websocket({
      logger,
      webSocketOptions,
    });
  }

  public get shardId() {
    return this.#shardId;
  }

  public get shardCount() {
    return this.#shardCount;
  }
}
