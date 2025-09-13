import { config } from "dotenv";
import path from "path";
import { ShardManagerServer } from "./server";

config({ path: path.join(process.cwd(), ".env") });

async function main() {
  console.log("🚀 Starting SiruBOT Shard Manager...");

  const requiredEnvVars = ["PORT"];
  const missingEnvVars = requiredEnvVars.filter(
    (envVar) => !process.env[envVar],
  );

  if (missingEnvVars.length > 0) {
    console.warn(
      `⚠️  Missing environment variables: ${missingEnvVars.join(", ")}`,
    );
    process.exit(1);
  }

  try {
    const shardManager = new ShardManagerServer();

    const gracefulShutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

      try {
        await shardManager.stop();
        console.log("✅ Shard Manager Server stopped gracefully");
        process.exit(0);
      } catch (error) {
        console.error("❌ Error during graceful shutdown:", error);
        process.exit(1);
      }
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    process.on("unhandledRejection", (reason, promise) => {
      console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
    });

    process.on("uncaughtException", (error) => {
      console.error("❌ Uncaught Exception:", error);
      process.exit(1);
    });

    await shardManager.start();
  } catch (error) {
    console.error("❌ Failed to start Shard Manager:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("❌ Fatal error in main:", error);
  process.exit(1);
});
