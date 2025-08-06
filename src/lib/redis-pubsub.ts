import { Redis } from '@upstash/redis';
import { config } from '@/config/env';

// Redis pub/sub 服务
export class RedisPubSub {
  private baseUrl: string;
  private token: string;
  private redis: Redis;

  constructor() {
    if (!config.redis.url || !config.redis.token) {
      throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required');
    }
    this.baseUrl = config.redis.url;
    this.token = config.redis.token;
    
    // 使用 SDK 进行发布操作
    this.redis = new Redis({
      url: config.redis.url,
      token: config.redis.token,
    });
  }

  // 发布消息到频道（使用 SDK）
  async publish(channel: string, message: string): Promise<void> {
    try {
      const result = await this.redis.publish(channel, message);
      console.log(`Published message to channel ${channel}, subscribers: ${result}`);
    } catch (error) {
      console.error('Redis publish error:', error);
      throw error;
    }
  }

  // 订阅频道（使用 HTTP API 长连接）
  async subscribe(channel: string, onMessage: (message: string) => void, signal?: AbortSignal): Promise<void> {
    try {
      console.log(`Subscribing to Redis channel: ${channel}`);
      
      const response = await fetch(`${this.baseUrl}/subscribe/${channel}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'text/event-stream',
        },
        signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to subscribe to Redis: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            console.log(`Redis subscription ended for channel: ${channel}`);
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.trim() === '') continue;
            
            // Handle SSE format: "data: <message>"
            if (line.startsWith('data: ')) {
              const sseData = line.substring(6); // Remove "data: " prefix
              try {
                // Try to parse as JSON (Upstash format)
                const parsed = JSON.parse(sseData);
                if (parsed.message) {
                  // Upstash Redis HTTP API format: {"message": "actual_message"}
                  onMessage(parsed.message);
                } else if (typeof parsed === 'string') {
                  onMessage(parsed);
                } else {
                  // If it's already an object, stringify it
                  onMessage(JSON.stringify(parsed));
                }
              } catch {
                // If not JSON, treat as plain text message
                if (sseData.trim()) {
                  onMessage(sseData.trim());
                }
              }
            } else {
              // Handle non-SSE format (fallback)
              try {
                // Try to parse as JSON first
                const data = JSON.parse(line);
                if (data.message) {
                  onMessage(data.message);
                } else if (typeof data === 'string') {
                  onMessage(data);
                } else {
                  onMessage(JSON.stringify(data));
                }
              } catch {
                // If not JSON, treat as plain text message
                if (line.trim()) {
                  onMessage(line.trim());
                }
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(`Redis subscription aborted for channel: ${channel}`);
      } else {
        console.error('Redis subscribe error:', error);
        throw error;
      }
    }
  }

  // 发布任务开始消息
  async publishTaskStart(taskId: string): Promise<void> {
    const message = JSON.stringify({
      type: 'start',
      taskId,
      timestamp: Date.now(),
    });
    await this.publish(`task:${taskId}`, message);
  }

  // 发布内容片段
  async publishContent(taskId: string, content: string): Promise<void> {
    const message = JSON.stringify({
      type: 'content',
      data: content,
      timestamp: Date.now(),
    });
    await this.publish(`task:${taskId}`, message);
  }

  // 发布任务完成消息
  async publishTaskEnd(taskId: string, fullContent: string): Promise<void> {
    const message = JSON.stringify({
      type: 'end',
      data: fullContent,
      timestamp: Date.now(),
    });
    await this.publish(`task:${taskId}`, message);
  }

  // 发布错误消息
  async publishError(taskId: string, error: string): Promise<void> {
    const message = JSON.stringify({
      type: 'error',
      data: error,
      timestamp: Date.now(),
    });
    await this.publish(`task:${taskId}`, message);
  }

  // 发布状态更新
  async publishStatus(taskId: string, status: string): Promise<void> {
    const message = JSON.stringify({
      type: 'status',
      data: status,
      timestamp: Date.now(),
    });
    await this.publish(`task:${taskId}`, message);
  }
}

// 导出单例实例（延迟初始化）
let redisPubSubInstance: RedisPubSub | null = null;

export const redisPubSub = {
  getInstance(): RedisPubSub {
    if (!redisPubSubInstance) {
      redisPubSubInstance = new RedisPubSub();
    }
    return redisPubSubInstance;
  },
  
  async publish(channel: string, message: string): Promise<void> {
    return this.getInstance().publish(channel, message);
  },
  
  async subscribe(channel: string, onMessage: (message: string) => void, signal?: AbortSignal): Promise<void> {
    return this.getInstance().subscribe(channel, onMessage, signal);
  },
  
  async publishTaskStart(taskId: string): Promise<void> {
    return this.getInstance().publishTaskStart(taskId);
  },
  
  async publishContent(taskId: string, content: string): Promise<void> {
    return this.getInstance().publishContent(taskId, content);
  },
  
  async publishTaskEnd(taskId: string, fullContent: string): Promise<void> {
    return this.getInstance().publishTaskEnd(taskId, fullContent);
  },
  
  async publishError(taskId: string, error: string): Promise<void> {
    return this.getInstance().publishError(taskId, error);
  },
  
  async publishStatus(taskId: string, status: string): Promise<void> {
    return this.getInstance().publishStatus(taskId, status);
  },
}; 