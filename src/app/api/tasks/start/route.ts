import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@upstash/qstash';
import { config } from '@/config/env';
import { setTaskStatus, TaskStatus } from '@/lib/redis';
console.log('*******, https://1r8vx4g7-3000.inc1.devtunnels.ms/')

// QStash 客户端（延迟初始化）
function getQStashClient(): Client {
  if (!config.qstash.token) {
    throw new Error('QSTASH_TOKEN environment variable is required');
  }
  return new Client({ token: config.qstash.token });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, model = 'gpt-3.5-turbo', maxTokens = 1000, temperature = 0.7 } = body;

    if (!prompt) {
      return NextResponse.json(
        { error: 'Missing prompt' },
        { status: 400 }
      );
    }

    // 生成唯一的任务 ID
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 初始化任务状态
    await setTaskStatus(taskId, TaskStatus.PENDING);

    // QStash webhook URL
    const webhookUrl = `${config.app.baseUrl}/api/qstash/webhook`;
    console.log('*************', webhookUrl)
    // 发送任务到 QStash
    const qstash = getQStashClient();
    const qstashResponse = await qstash.publishJSON({
      url: webhookUrl,
      body: {
        taskId,
        prompt,
        model,
        maxTokens,
        temperature,
      },
      // 可选：设置延迟、重试等
      delay: 0,
      retries: 3,
    });

    console.log('Task queued with QStash:', {
      taskId,
      messageId: qstashResponse.messageId,
    });

    return NextResponse.json({
      success: true,
      taskId,
      messageId: qstashResponse.messageId,
      message: 'Task queued successfully',
    });
  } catch (error) {
    console.error('Failed to start task:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to start task',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// 获取任务状态
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const taskId = url.searchParams.get('taskId');

  if (!taskId) {
    return NextResponse.json(
      { error: 'Missing taskId parameter' },
      { status: 400 }
    );
  }

  try {
    const { getTaskStatus, getTaskError } = await import('@/lib/redis');
    
    const status = await getTaskStatus(taskId);
    const error = status === TaskStatus.FAILED ? await getTaskError(taskId) : null;

    return NextResponse.json({
      taskId,
      status,
      error,
    });
  } catch (error) {
    console.error('Failed to get task status:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to get task status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 