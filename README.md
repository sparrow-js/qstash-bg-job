# QStash 长任务处理系统

这是一个使用 Upstash QStash 执行长时间运行任务的完整解决方案。系统通过 QStash 队列执行 OpenAI 流式任务，将数据存储到 Redis，然后通过 Server-Sent Events (SSE) 实时推送数据到客户端。

## 🚀 功能特性

- **异步任务处理**: 使用 QStash 避免 Vercel API 时间限制
- **流式数据处理**: OpenAI 流式响应实时存储到 Redis
- **实时数据推送**: 通过 SSE 向客户端推送数据
- **任务状态管理**: 完整的任务生命周期跟踪
- **错误处理**: 全面的错误处理和恢复机制
- **现代化 UI**: 响应式设计，实时状态更新

## 🛠️ 技术栈

- **前端**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **后端**: Next.js API Routes
- **队列**: Upstash QStash
- **数据库**: Upstash Redis
- **AI**: OpenAI GPT API
- **实时通信**: Server-Sent Events

## 📋 环境要求

1. **Upstash QStash 账户**
   - 访问 [Upstash Console](https://console.upstash.com/)
   - 创建 QStash 项目
   - 获取 Token 和 Signing Keys

2. **Upstash Redis 数据库**
   - 在 Upstash Console 创建 Redis 数据库
   - 获取 REST URL 和 Token

3. **OpenAI API 密钥**
   - 访问 [OpenAI Platform](https://platform.openai.com/)
   - 创建 API 密钥

## ⚙️ 安装配置

### 1. 克隆并安装依赖

\`\`\`bash
git clone <repository-url>
cd qstash-bg-job
npm install
\`\`\`

### 2. 环境变量配置

项目根目录已包含 \`.env\` 文件模板，请根据实际情况填入对应的值：

\`\`\`bash
# 编辑环境变量文件
nano .env
# 或使用其他编辑器
code .env
\`\`\`

必需配置的环境变量：

\`\`\`env
# QStash Configuration（从 https://console.upstash.com/ 获取）
QSTASH_TOKEN=your_qstash_token_here
QSTASH_CURRENT_SIGNING_KEY=your_qstash_signing_key_here
QSTASH_NEXT_SIGNING_KEY=your_qstash_next_signing_key_here

# Upstash Redis Configuration（从 https://console.upstash.com/ 获取）
UPSTASH_REDIS_REST_URL=your_redis_rest_url_here
UPSTASH_REDIS_REST_TOKEN=your_redis_rest_token_here

# OpenAI Configuration（从 https://platform.openai.com/ 获取）
OPENAI_API_KEY=your_openai_api_key_here
\`\`\`

### 3. 验证环境变量

构建项目时，Next.js 会自动检测并加载 \`.env\` 文件：

\`\`\`bash
npm run build
\`\`\`

如果看到 \`- Environments: .env\` 说明环境变量文件已成功加载。

### 4. 运行应用

\`\`\`bash
# 开发模式
npm run dev

# 生产构建
npm run build
npm run start
\`\`\`

## 🔧 API 端点

### 启动任务
\`POST /api/tasks/start\`

请求体：
\`\`\`json
{
  "prompt": "写一个关于人工智能的短故事",
  "model": "gpt-3.5-turbo",
  "maxTokens": 1000,
  "temperature": 0.7
}
\`\`\`

响应：
\`\`\`json
{
  "success": true,
  "taskId": "task_1234567890_abcdef123",
  "messageId": "qstash_message_id",
  "message": "Task queued successfully"
}
\`\`\`

### 获取任务状态
\`GET /api/tasks/start?taskId=task_1234567890_abcdef123\`

响应：
\`\`\`json
{
  "taskId": "task_1234567890_abcdef123",
  "status": "running",
  "error": null
}
\`\`\`

### SSE 流数据
\`GET /api/tasks/stream?taskId=task_1234567890_abcdef123\`

返回 Server-Sent Events 流，包含以下消息类型：
- \`connected\`: 连接建立
- \`content\`: OpenAI 生成的内容片段
- \`end\`: 任务完成
- \`error\`: 错误信息
- \`status\`: 状态更新

### QStash Webhook
\`POST /api/qstash/webhook\`

由 QStash 调用，执行实际的长任务。

## 🏗️ 系统架构

\`\`\`
[客户端] → [启动任务 API] → [QStash 队列] → [Webhook 处理器] → [OpenAI API]
    ↓                                              ↓                    ↓
[SSE 连接] ← [Redis Pub/Sub HTTP 订阅] ←────── [Redis Pub/Sub 发布] ←─┘
                    ↑
        [Upstash Redis 实时消息队列]
\`\`\`

### 工作流程

1. **建立连接**: 客户端建立 SSE 连接，通过 HTTP 长连接订阅 Redis 频道
2. **任务提交**: 客户端通过 \`/api/tasks/start\` 提交任务到 QStash 队列
3. **异步执行**: QStash 调用 webhook 执行 OpenAI 流式任务
4. **实时发布**: OpenAI 流式响应发布到 Upstash Redis 频道
5. **实时订阅**: SSE 连接通过 Redis HTTP 订阅接收消息并推送到客户端
6. **状态同步**: 任务状态通过 Redis pub/sub 实时更新

### 🚀 核心优势

- **真正的流式处理**: 基于 Redis pub/sub，无轮询机制
- **混合架构**: 发布使用 Redis SDK（高性能），订阅使用 HTTP API（长连接）
- **高可靠性**: 使用 Upstash Redis 托管服务，99.9% 可用性
- **低延迟**: HTTP 长连接订阅，毫秒级消息传递
- **可扩展性**: 支持多实例部署，Redis 作为消息中转
- **实时性**: 数据生成即发布，订阅端立即接收
- **最佳实践**: 发布用 SDK（批量优化），订阅用 HTTP（长连接稳定）

## 📁 项目结构

\`\`\`
src/
├── app/
│   ├── api/
│   │   ├── tasks/
│   │   │   ├── start/route.ts      # 启动任务 API
│   │   │   └── stream/route.ts     # SSE 流数据 API
│   │   └── qstash/
│   │       └── webhook/route.ts    # QStash webhook 处理器
│   ├── page.tsx                    # 主页面
│   └── layout.tsx                  # 布局组件
├── config/
│   └── env.ts                      # 环境变量配置
└── lib/
    ├── redis.ts                    # Redis 客户端和工具函数
    ├── redis-pubsub.ts             # Redis pub/sub 服务
    └── openai.ts                   # OpenAI 服务
\`\`\`

## 🔍 监控和调试

### 日志查看
- 开发环境：查看控制台输出
- 生产环境：查看 Vercel 函数日志

### QStash 监控
- 访问 Upstash Console 查看队列状态
- 监控消息处理情况和错误

### Redis 监控
- 使用 Upstash Console 监控 Redis 使用情况
- 查看任务数据和状态

## 🚨 故障排除

### 常见问题

1. **任务无法启动**
   - 检查 QStash Token 是否正确
   - 确认 webhook URL 可访问

2. **SSE 连接失败**
   - 检查任务 ID 是否存在
   - 确认 Redis 连接正常

3. **OpenAI API 调用失败**
   - 检查 API Key 是否有效
   - 确认账户余额充足

4. **环境变量问题**
   - 使用 \`src/config/env.ts\` 中的验证函数
   - 确保所有必需的环境变量都已设置

### 调试技巧

1. **开发环境测试**：
   \`\`\`bash
   # 直接测试 webhook（绕过签名验证）
   curl "http://localhost:3000/api/qstash/webhook?taskId=test&prompt=Hello"
   \`\`\`

2. **查看 Redis 数据**：
   使用 Upstash Console 或 Redis CLI 查看存储的任务数据

3. **监控网络请求**：
   使用浏览器开发者工具监控 SSE 连接和 API 调用

## 🚀 部署

### Vercel 部署

1. 连接 GitHub 仓库到 Vercel
2. 在 Vercel 控制台设置环境变量
3. 部署应用
4. 更新 \`NEXT_PUBLIC_BASE_URL\` 为部署后的域名

### 环境变量设置

确保在 Vercel 项目设置中添加所有必需的环境变量。

## 📝 许可证

MIT License

## 🤝 贡献

欢迎提交 Issues 和 Pull Requests！

## 📞 支持

如有问题，请创建 GitHub Issue 或联系开发者。
