/**
 * Prisma 数据库客户端单例（懒加载）
 *
 * 使用 Proxy 延迟初始化，避免模块 import 时就访问 DATABASE_URL，
 * 解决 Next.js build 阶段静态分析时因环境变量缺失而报错的问题。
 * 实际客户端仅在第一次调用数据库方法时才创建。
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import logger from "@/lib/logger";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/** 真正创建 PrismaClient，只有在运行时第一次访问 prisma 属性时才执行 */
function getOrCreateClient(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL 环境变量未设置");
  }

  const adapter = new PrismaPg({ connectionString });
  const client = new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }

  if (process.env.NODE_ENV === "development") {
    client.$connect().then(() => {
      logger.info("数据库连接成功");
    }).catch((err: Error) => {
      logger.error("数据库连接失败", { error: err.message });
    });
  }

  return client;
}

/**
 * 通过 Proxy 实现懒加载：import 时不初始化，
 * 第一次调用 prisma.xxx 时才触发 getOrCreateClient()
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop: string | symbol) {
    return getOrCreateClient()[prop as keyof PrismaClient];
  },
});
