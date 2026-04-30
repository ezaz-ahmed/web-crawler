import { Redis } from 'ioredis';
import { config } from '../config/env.js';

export const redisConnection = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
});
