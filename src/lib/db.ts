/**
 * Prisma 数据库客户端单例
 *
 * Prisma 7 使用 adapter 模式连接 PostgreSQL：
 * - 通过 @prisma/adapter-pg 适配器连接
 * - DATABASE_URL 从环境变量读取
 * - 单例模式防止开发热重载时连接泄漏
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import logger from "@/lib/logger";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL 环境变量未设置");
  }

  // Prisma 7 使用 adapter 连接 PostgreSQL
  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// 记录数据库连接状态（仅开发环境）
if (process.env.NODE_ENV === "development") {
  prisma.$connect().then(() => {
    logger.info("数据库连接成功");
  }).catch((err: Error) => {
    logger.error("数据库连接失败", { error: err.message });
  });
}
