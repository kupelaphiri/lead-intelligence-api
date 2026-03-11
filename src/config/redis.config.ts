export const buildRedisConnection = (): {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db: number;
  tls?: Record<string, never>;
} => ({
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: Number.parseInt(process.env.REDIS_PORT ?? '6379', 10),
  username: process.env.REDIS_USERNAME || undefined,
  password: process.env.REDIS_PASSWORD || undefined,
  db: Number.parseInt(process.env.REDIS_DB ?? '0', 10),
  ...(process.env.REDIS_TLS === 'true' ? { tls: {} } : {}),
});
