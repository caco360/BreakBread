// Connection settings come from environment variables.
// The defaults match docker-compose.yml so local development works with no setup.
export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl:
    process.env.DATABASE_URL ?? "postgres://breakbread:breakbread@localhost:5432/break_bread",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
};
