import { Redis } from '@upstash/redis';
import { config } from '@/config/env';

// Redis 客户端实例（延迟初始化）
let redis: Redis | null = null;

function getRedisClient(): Redis {
  if (!redis) {
    if (!config.redis.url || !config.redis.token) {
      throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables are required');
    }
    redis = new Redis({
      url: config.redis.url,
      token: config.redis.token,
    });
  }
  return redis;
}

// Redis 键名常量
export const REDIS_KEYS = {
  TASK_STATUS: (taskId: string) => `task:${taskId}:status`,
  TASK_RESULT: (taskId: string) => `task:${taskId}:result`,
  TASK_STREAM: (taskId: string) => `task:${taskId}:stream`,
  TASK_ERROR: (taskId: string) => `task:${taskId}:error`,
};

// 任务状态枚举
export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running', 
  COMPLETED = 'completed',
  FAILED = 'failed',
}

// 存储任务状态
export async function setTaskStatus(taskId: string, status: TaskStatus) {
  const client = getRedisClient();
  await client.set(REDIS_KEYS.TASK_STATUS(taskId), status, { ex: 3600 }); // 1小时过期
}

// 获取任务状态
export async function getTaskStatus(taskId: string): Promise<TaskStatus | null> {
  const client = getRedisClient();
  return await client.get(REDIS_KEYS.TASK_STATUS(taskId));
}

// 添加流数据到任务
export async function addStreamData(taskId: string, data: string) {
  const client = getRedisClient();
  await client.lpush(REDIS_KEYS.TASK_STREAM(taskId), data);
  await client.expire(REDIS_KEYS.TASK_STREAM(taskId), 3600); // 1小时过期
}

// 获取流数据
export async function getStreamData(taskId: string, start = 0, end = -1): Promise<string[]> {
  const client = getRedisClient();
  const data = await client.lrange(REDIS_KEYS.TASK_STREAM(taskId), start, end);
  return data.reverse(); // 反转以获得正确的顺序
}

// 存储任务错误
export async function setTaskError(taskId: string, error: string) {
  const client = getRedisClient();
  await client.set(REDIS_KEYS.TASK_ERROR(taskId), error, { ex: 3600 });
}

// 获取任务错误
export async function getTaskError(taskId: string): Promise<string | null> {
  const client = getRedisClient();
  return await client.get(REDIS_KEYS.TASK_ERROR(taskId));
}

// 清理任务数据
export async function cleanupTask(taskId: string) {
  const client = getRedisClient();
  await Promise.all([
    client.del(REDIS_KEYS.TASK_STATUS(taskId)),
    client.del(REDIS_KEYS.TASK_RESULT(taskId)),
    client.del(REDIS_KEYS.TASK_STREAM(taskId)),
    client.del(REDIS_KEYS.TASK_ERROR(taskId)),
  ]);
} 