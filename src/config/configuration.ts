export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    name: process.env.DB_DATABASE || 'ai_demo',
  },
  rabbitmq: {
    user: process.env.RMQ_USER || 'guest',
    password: process.env.RMQ_PASSWORD || 'guest',
    host: process.env.RMQ_HOST || 'localhost',
    port: parseInt(process.env.RMQ_PORT || '5672', 10),
  },
  ai: {
    openaiKey: process.env.OPENAI_API_KEY,
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    modelName: process.env.AI_MODEL_NAME || 'qwen3.5:9b',
  },
});
