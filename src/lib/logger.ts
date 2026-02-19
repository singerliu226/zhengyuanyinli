/**
 * Winston 日志模块
 *
 * 统一日志管理策略：
 * - 生产环境：info 级别起记录，输出为 JSON 格式（方便 Zeabur 日志采集）
 * - 开发环境：debug 级别起记录，输出为人类可读的彩色格式
 * - 同时输出到控制台（Zeabur 会采集 stdout）
 *
 * 使用方式：
 *   import logger from '@/lib/logger'
 *   logger.info('卡密激活', { code: 'XXXX-...', phone: '138...' })
 *   logger.error('API 调用失败', { error: err.message })
 */

import winston from "winston";

const isDev = process.env.NODE_ENV !== "production";

/**
 * 开发环境格式：彩色 + 时间戳 + 模块路径 + 消息
 * 生产环境格式：JSON（便于 Zeabur 日志系统解析）
 */
const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);

const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const logger = winston.createLogger({
  level: isDev ? "debug" : "info",
  format: isDev ? devFormat : prodFormat,
  transports: [
    new winston.transports.Console(),
  ],
  // 捕获未处理的 Promise rejection，防止进程崩溃时无日志
  handleExceptions: true,
  handleRejections: true,
});

export default logger;

/**
 * 为特定业务模块创建子日志器，自动附带模块标识
 * 便于日志过滤和追踪
 *
 * @param module 模块名称，如 'cardkey', 'ai', 'scoring'
 */
export function createModuleLogger(module: string) {
  return logger.child({ module });
}
