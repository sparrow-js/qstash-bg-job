'use client';

import { useState, useEffect, useRef } from 'react';

interface StreamMessage {
  type: 'connected' | 'content' | 'end' | 'error' | 'status';
  data?: string;
  taskId?: string;
  timestamp: number;
}

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const eventSourceRef = useRef<EventSource | null>(null);

  // 启动长任务
  const startTask = async () => {
    if (!prompt.trim()) {
      alert('请输入提示词');
      return;
    }

    setIsLoading(true);
    setContent('');
    setError('');
    setStatus('正在启动任务...');

    try {
      const response = await fetch('/api/tasks/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          model: 'gpt-3.5-turbo',
          maxTokens: 1000,
          temperature: 0.7,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setTaskId(result.taskId);
        setStatus('任务已排队，开始监听流数据...');
        startListening(result.taskId);
      } else {
        setError(result.error || '启动任务失败');
        setIsLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
      setIsLoading(false);
    }
  };

  // 开始监听 SSE 流
  const startListening = (taskId: string) => {
    // 关闭之前的连接
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(`/api/tasks/stream?taskId=${taskId}`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const message: StreamMessage = JSON.parse(event.data);
        
        switch (message.type) {
          case 'connected':
            setStatus('已连接，等待数据...');
            break;
            
          case 'content':
            setContent(prev => prev + (message.data || ''));
            setStatus('正在接收数据...');
            break;
            
          case 'end':
            setStatus('任务完成！');
            setIsLoading(false);
            break;
            
          case 'error':
            setError(message.data || '未知错误');
            setStatus('任务失败');
            setIsLoading(false);
            break;
            
          case 'status':
            setStatus(`任务状态: ${message.data}`);
            if (message.data === 'completed' || message.data === 'failed') {
              setIsLoading(false);
            }
            break;
        }
      } catch (err) {
        console.error('解析 SSE 消息失败:', err);
      }
    };

    eventSource.onerror = (event) => {
      console.error('SSE 连接错误:', event);
      setError('连接中断');
      setIsLoading(false);
      eventSource.close();
    };
  };

  // 停止监听
  const stopListening = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsLoading(false);
    setStatus('已停止监听');
  };

  // 清理
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            QStash 长任务处理系统
          </h1>
          
          <div className="space-y-6">
            {/* 输入区域 */}
            <div>
              <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-2">
                请输入您的提示词：
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => {
                  console.log('*********', e)
                  setPrompt(e.target.value)
                }}
                placeholder="例如：写一个关于人工智能的短故事..."
                className="w-full h-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isLoading}
              />
            </div>

            {/* 控制按钮 */}
            <div className="flex space-x-4">
              <p>{prompt.trim()}</p>
              <button
                onClick={startTask}
                disabled={isLoading || !prompt.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isLoading ? '处理中...' : '开始任务'}
              </button>
              
              {isLoading && (
                <button
                  onClick={stopListening}
                  className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  停止监听
                </button>
              )}
            </div>

            {/* 状态显示 */}
            {status && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-800">
                  <strong>状态:</strong> {status}
                </p>
                {taskId && (
                  <p className="text-sm text-blue-600 mt-1">
                    <strong>任务ID:</strong> {taskId}
                  </p>
                )}
              </div>
            )}

            {/* 错误显示 */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-800">
                  <strong>错误:</strong> {error}
                </p>
              </div>
            )}

            {/* 结果显示 */}
            {content && (
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-gray-900">生成结果：</h3>
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-md">
                  <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono">
                    {content}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 使用说明 */}
        <div className="mt-8 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">使用说明</h2>
          <div className="prose text-gray-600">
            <ol className="list-decimal list-inside space-y-2">
              <li>在文本框中输入您想要 AI 处理的提示词</li>
              <li>点击&ldquo;开始任务&rdquo;按钮，系统会将任务发送到 QStash 队列</li>
              <li>任务将在后台执行，调用 OpenAI API 生成流式响应</li>
              <li>生成的内容会实时通过 SSE 推送到浏览器并显示</li>
              <li>任务完成后会显示完整的生成结果</li>
            </ol>
            
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800">
                <strong>注意:</strong> 请确保已正确配置所有环境变量（QStash Token、Redis 配置、OpenAI API Key 等）
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
