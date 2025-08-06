import { NextRequest, NextResponse } from 'next/server';
import { getTaskStatus } from '@/lib/redis';
import { redisPubSub } from '@/lib/redis-pubsub';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const taskId = url.searchParams.get('taskId');

  if (!taskId) {
    return NextResponse.json(
      { error: 'Missing taskId parameter' },
      { status: 400 }
    );
  }

  // 检查任务是否存在
  try {
    const status = await getTaskStatus(taskId);
    if (!status) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('Failed to check task status:', error);
    return NextResponse.json(
      { error: 'Failed to check task status' },
      { status: 500 }
    );
  }

  // 创建 SSE 流，订阅 Redis 频道
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      console.log(`Starting SSE stream for task: ${taskId}`);
      
      // 发送初始连接消息
      const sendMessage = (data: Record<string, unknown>) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      sendMessage({
        type: 'connected',
        taskId,
        timestamp: Date.now(),
      });

      // 创建 AbortController 用于取消订阅
      const abortController = new AbortController();

      // 监听请求取消
      req.signal.addEventListener('abort', () => {
        abortController.abort();
      });

      try {
        // 订阅 Redis 频道
        await redisPubSub.subscribe(
          `task:${taskId}`,
          (message: string) => {
            try {
              console.log('Redis message:', message);
              // 解析并转发消息
              const data = message;
              sendMessage({message: data});
              
              // 如果任务完成或失败，关闭连接
              // if (data.type === 'end' || data.type === 'error') {
              //   setTimeout(() => {
              //     try {
              //       controller.close();
              //     } catch (error) {
              //       console.error('Error closing SSE stream:', error);
              //     }
              //   }, 1000);
              // }
            } catch (parseError) {
              console.error('Failed to parse Redis message:', parseError);
              // 如果解析失败，作为原始消息发送
              sendMessage({
                type: 'raw',
                data: message,
                timestamp: Date.now(),
              });
            }
          },
          abortController.signal
        );
      } catch (error) {
        console.error('Redis subscription error:', error);
        
        // 发送错误消息
        sendMessage({
          type: 'error',
          data: error instanceof Error ? error.message : 'Subscription failed',
          timestamp: Date.now(),
        });
        
        // 关闭连接
        setTimeout(() => {
          try {
            controller.close();
          } catch (closeError) {
            console.error('Error closing SSE stream after error:', closeError);
          }
        }, 1000);
      }
    },

    cancel() {
      console.log(`SSE stream cancelled for task: ${taskId}`);
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  });
}

// 选项请求处理（CORS）
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
} 