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

// 追加任务状态（使用追加模式）
export async function setTaskStatus(taskId: string, status: TaskStatus) {
  const client = getRedisClient();
  // 使用 lpush 追加状态到列表头部
  await client.lpush(REDIS_KEYS.TASK_STATUS(taskId), JSON.stringify({
    status,
    timestamp: Date.now()
  }));
  await client.expire(REDIS_KEYS.TASK_STATUS(taskId), 3600); // 1小时过期
}

// 获取最新任务状态
export async function getTaskStatus(taskId: string): Promise<TaskStatus | null> {
  const client = getRedisClient();
  // 获取列表中最新的状态（索引0）
  const statusData = await client.lindex(REDIS_KEYS.TASK_STATUS(taskId), 0);
  if (!statusData) return null;
  
  try {
    const parsed = JSON.parse(statusData);
    return parsed.status;
  } catch {
    // 向后兼容：如果不是JSON格式，直接返回
    return statusData as TaskStatus;
  }
}

// 获取任务状态历史
export async function getTaskStatusHistory(taskId: string): Promise<Array<{status: TaskStatus, timestamp: number}>> {
  const client = getRedisClient();
  const statusList = await client.lrange(REDIS_KEYS.TASK_STATUS(taskId), 0, -1);
  
  return statusList.map(statusData => {
    try {
      return JSON.parse(statusData);
    } catch {
      // 向后兼容
      return { status: statusData as TaskStatus, timestamp: 0 };
    }
  }).reverse(); // 反转以获得正确的时间顺序
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

// 追加任务错误（使用追加模式）
export async function setTaskError(taskId: string, error: string) {
  const client = getRedisClient();
  // 使用 lpush 追加错误到列表头部
  await client.lpush(REDIS_KEYS.TASK_ERROR(taskId), JSON.stringify({
    error,
    timestamp: Date.now()
  }));
  await client.expire(REDIS_KEYS.TASK_ERROR(taskId), 3600);
}

// 获取最新任务错误
export async function getTaskError(taskId: string): Promise<string | null> {
  const client = getRedisClient();
  // 获取列表中最新的错误（索引0）
  const errorData = await client.lindex(REDIS_KEYS.TASK_ERROR(taskId), 0);
  if (!errorData) return null;
  
  try {
    const parsed = JSON.parse(errorData);
    return parsed.error;
  } catch {
    // 向后兼容：如果不是JSON格式，直接返回
    return errorData;
  }
}

// 获取任务错误历史
export async function getTaskErrorHistory(taskId: string): Promise<Array<{error: string, timestamp: number}>> {
  const client = getRedisClient();
  const errorList = await client.lrange(REDIS_KEYS.TASK_ERROR(taskId), 0, -1);
  
  return errorList.map(errorData => {
    try {
      return JSON.parse(errorData);
    } catch {
      // 向后兼容
      return { error: errorData, timestamp: 0 };
    }
  }).reverse(); // 反转以获得正确的时间顺序
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