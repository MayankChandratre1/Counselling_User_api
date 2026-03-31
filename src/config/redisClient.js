import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const isRedisEnabled = Boolean(process.env.REDIS_URL);

const redis = isRedisEnabled ? new Redis(process.env.REDIS_URL) : null;

if (redis) {
  redis.on('error', (err) => {
    console.error('Redis error:', err);
  });
}

export { isRedisEnabled };
export default redis;
