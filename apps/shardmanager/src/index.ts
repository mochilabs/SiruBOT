import { config } from "dotenv";
import path from "path";
import { ShardManagerServer } from "./server.ts";
import { getLogger } from "./utils/logger.ts";
import { getGatewayInfo } from "./utils/gateway.ts";
import { validateEnv } from "./config/env.ts";

config({ path: path.join(process.cwd(), ".env") });

const logger = getLogger("bootstrap");
async function main() {
  logger.info("Starting SiruBOT Shard manager...");

  // Validate environment variables
  const env = validateEnv();

  try {
    let shardCount: number;

    if (env.SHARD_COUNT === "auto") {
      logger.info("SHARD_COUNT is set to 'auto', fetching from Discord API...");
      const gatewayInfo = await getGatewayInfo();
      if (!gatewayInfo) {
        logger.fatal(
          "Failed to get gateway info, please check your DISCORD_TOKEN",
        );
        process.exit(1);
      }
      logger.debug(`Gateway info: `, gatewayInfo);
      logger.info(`Auto detected shard count: ${gatewayInfo.shards} shards`);
      shardCount = gatewayInfo.shards;
    } else {
      shardCount = env.SHARD_COUNT;
      logger.info(`Using configured shard count: ${shardCount} shards`);
    }

    const shardManager = new ShardManagerServer(shardCount);
    logger.info("Setting up routes...");
    await shardManager.setupRoutes();

    const gracefulShutdown = async (signal: string) => {
      logger.warn(`Received ${signal}. Starting graceful shutdown...`);

      try {
        await shardManager.stop();
        logger.info("Shard manager server stopped gracefully");
        process.exit(0);
      } catch (error) {
        logger.error("Error during graceful shutdown:", error);
        process.exit(1);
      }
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    process.on("unhandledRejection", (reason, promise) => {
      logger.error("Unhandled Rejection at:", promise, "reason:", reason);
    });

    process.on("uncaughtException", (error) => {
      logger.fatal("Uncaught Exception:", error);
      process.exit(1);
    });

    await shardManager.start();
  } catch (error) {
    logger.fatal("Failed to start Shard manager:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  logger.fatal("Fatal error in main:", error);
  process.exit(1);
});
