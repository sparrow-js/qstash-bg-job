import { NextRequest, NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { executeOpenAIStreamTask, StreamTaskOptions } from '@/lib/openai';
import { setTaskStatus, TaskStatus } from '@/lib/redis';
import { redisPubSub } from '@/lib/redis-pubsub';
import { config } from '@/config/env';

// QStash webhook 处理器
async function handler(req: NextRequest) {
  try {

    console.log('***************** enter qstash')
    const body = await req.json();
    const { taskId, prompt, model, maxTokens, temperature } = body as StreamTaskOptions;

    if (!taskId || !prompt) {
      return NextResponse.json(
        { error: 'Missing taskId or prompt' },
        { status: 400 }
      );
    }

    console.log(`Starting long task: ${taskId}`);
    
    // 通过 Redis pub/sub 发送任务开始状态
    await redisPubSub.publishStatus(taskId, 'starting');

    // 设置任务状态为待处理
    await setTaskStatus(taskId, TaskStatus.PENDING);

    // 执行 OpenAI 流式任务（这会自动通过 Redis pub/sub 推送数据）
    const result = await executeOpenAIStreamTask({
      taskId,
      prompt,
      model,
      maxTokens,
      temperature,
    });

    console.log(`Task ${taskId} completed:`, result.success ? 'success' : 'failed');

    return NextResponse.json({
      success: true,
      taskId,
      result: result.success,
      message: result.success ? 'Task completed successfully' : 'Task failed',
      error: result.success ? undefined : result.error,
    });
  } catch (error) {
    console.error('QStash webhook error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // 如果有任务ID，通过 Redis pub/sub 发送错误
    const body = await req.json().catch(() => ({}));
    if (body.taskId) {
      await redisPubSub.publishError(body.taskId, errorMessage);
    }
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}

// POST 处理器 - 在运行时验证签名
export async function POST(req: NextRequest) {
  // 在生产环境验证 QStash 签名
  if (process.env.NODE_ENV === 'production' && config.qstash.currentSigningKey) {
    try {
      const receiver = new Receiver({
        currentSigningKey: config.qstash.currentSigningKey,
        nextSigningKey: config.qstash.nextSigningKey,
      });
      
      const signature = req.headers.get('upstash-signature');
      const body = await req.text();
      
      if (signature) {
        const isValid = await receiver.verify({
          signature,
          body,
        });
        
        if (!isValid) {
          return NextResponse.json(
            { error: 'Invalid signature' },
            { status: 401 }
          );
        }
      }
      
      // 重新创建请求对象，因为body已经被读取
      const newReq = new NextRequest(req.url, {
        method: 'POST',
        headers: req.headers,
        body,
      });
      
      return handler(newReq);
    } catch (error) {
      console.error('Signature verification failed:', error);
      return NextResponse.json(
        { error: 'Signature verification failed' },
        { status: 401 }
      );
    }
  }
  
  // 开发环境或没有配置签名密钥时直接处理
  return handler(req);
}

// 为了测试，也允许不验证签名的请求（开发环境）
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'development') {
    // 在开发环境中，允许 GET 请求进行测试
    const url = new URL(req.url);
    const taskId = url.searchParams.get('taskId') || `test-task-${Date.now()}`;
    const prompt = url.searchParams.get('prompt') || 'Tell me a short story about technology';

    console.log(`Development test: Starting task ${taskId}`);

    return handler(new NextRequest(req.url, {
      method: 'POST',
      body: JSON.stringify({ taskId, prompt }),
      headers: { 'content-type': 'application/json' },
    }));
  }

  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
} 