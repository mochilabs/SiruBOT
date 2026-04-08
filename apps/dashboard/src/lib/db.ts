import { PrismaClient } from "@sirubot/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

let client: PrismaClient | undefined;

function getClient(): PrismaClient {
  if (!client) {
    client = new PrismaClient({
        adapter: new PrismaPg({
            connectionString: process.env.DATABASE_URL
        })
    });
  }
  return client;
}

// Proxy ensures PrismaClient is only created when actually used (e.g. db.track.findMany()),
// not when the module is imported during Next.js build.
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return Reflect.get(getClient(), prop);
  },
});