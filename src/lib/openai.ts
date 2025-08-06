import OpenAI from 'openai';
import { config } from '@/config/env';
import { setTaskStatus, setTaskError, TaskStatus, addStreamData } from './redis';
import { redisPubSub } from './redis-pubsub';

// OpenAI 客户端实例（延迟初始化）
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    if (!config.openai.apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    openai = new OpenAI({
      apiKey: config.openai.apiKey,
      baseURL: config.openai.baseURL,
    });
  }
  return openai;
}

export interface StreamTaskOptions {
  taskId: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

// 执行 OpenAI 流式任务并通过 Redis pub/sub 实时推送
export async function executeOpenAIStreamTask({
  taskId,
  prompt,
  model = 'openai/gpt-3.5-turbo',
  maxTokens = 1000,
  temperature = 0.7,
}: StreamTaskOptions) {
  try {
    // 设置任务状态为运行中
    await setTaskStatus(taskId, TaskStatus.RUNNING);
    await redisPubSub.publishStatus(taskId, 'running');

    console.log(`Starting OpenAI stream task: ${taskId}`);
    
    // 发布任务开始消息
    await redisPubSub.publishTaskStart(taskId);

    // 创建流式聊天完成
    const openaiClient = getOpenAIClient();
    const stream = await openaiClient.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature,
      stream: true,
    });

    let fullContent = '';
    
    // 处理流数据并通过 Redis pub/sub 实时推送
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      
      if (content) {
        fullContent += content;
        
        // 将内容片段追加到 Redis 存储
        await addStreamData(taskId, content);
        
        // 通过 Redis pub/sub 推送内容片段
        await redisPubSub.publishContent(taskId, content);
      }
    }

    // 发送完成消息
    await redisPubSub.publishTaskEnd(taskId, fullContent);

    // 设置任务状态为完成
    await setTaskStatus(taskId, TaskStatus.COMPLETED);
    await redisPubSub.publishStatus(taskId, 'completed');

    console.log(`OpenAI stream task completed: ${taskId}`);

    return { success: true, content: fullContent };
  } catch (error) {
    console.error('OpenAI stream task failed:', error);
    
    // 存储错误信息到 Redis（用于后续查询）
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await setTaskError(taskId, errorMessage);
    await setTaskStatus(taskId, TaskStatus.FAILED);

    // 通过 Redis pub/sub 发送错误消息
    await redisPubSub.publishError(taskId, errorMessage);
    await redisPubSub.publishStatus(taskId, 'failed');

    return { success: false, error: errorMessage };
  }
}

// 简单的文本生成任务（非流式）
export async function generateText(prompt: string): Promise<string> {
  const openaiClient = getOpenAIClient();
  const response = await openaiClient.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1000,
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content || '';
} 