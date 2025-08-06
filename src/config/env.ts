// 环境变量配置
export const config = {
  qstash: {
    token: process.env.QSTASH_TOKEN || '',
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY || '',
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || '',
  },
  redis: {
    url: process.env.UPSTASH_REDIS_REST_URL || '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },
  app: {
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'https://1r8vx4g7-3000.inc1.devtunnels.ms/',
  },
};

// 验证必要的环境变量
export function validateEnv() {
  const required = [
    'QSTASH_TOKEN',
    'QSTASH_CURRENT_SIGNING_KEY', 
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'OPENAI_API_KEY',
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
} 