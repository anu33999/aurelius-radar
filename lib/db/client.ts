import { PrismaClient } from "@prisma/client";

type Client = InstanceType<typeof PrismaClient>;

const globalForPrisma = globalThis as unknown as { prisma?: Client };

function getClient(): Client {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = new PrismaClient();
  return globalForPrisma.prisma;
}

/**
 * Lazily-created Prisma client. Nothing connects (or throws) at import time, so `next build`
 * and tooling work even before `prisma generate` has been run.
 */
export const prisma: Client = new Proxy({} as Client, {
  get(_target, prop) {
    const client = getClient() as unknown as Record<string | symbol, unknown>;
    const value = client[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(client) : value;
  },
});
