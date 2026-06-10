import type {
  CrawlResult,
  CrawlType,
  JobState,
  JobStatus,
  MultiPageResult,
  SingleUrlResult,
} from '../../types.js';
import { redisConnection } from '../../plugins/redis.js';

const JOB_TTL = 24 * 60 * 60;
const KEY = (id: string) => `job:${id}`;

function serialize(state: JobState): string {
  return JSON.stringify(state);
}

function deserialize(raw: string): JobState {
  const obj = JSON.parse(raw);
  obj.createdAt = new Date(obj.createdAt);
  if (obj.completedAt) obj.completedAt = new Date(obj.completedAt);
  return obj as JobState;
}

export async function createJobState(jobId: string, type: CrawlType): Promise<JobState> {
  const state: JobState = {
    jobId,
    type,
    status: 'queued',
    createdAt: new Date(),
  };
  await redisConnection.set(KEY(jobId), serialize(state), 'EX', JOB_TTL);
  return state;
}

export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  error?: string,
): Promise<void> {
  const raw = await redisConnection.get(KEY(jobId));
  if (!raw) throw new Error(`Job ${jobId} not found`);
  const job = deserialize(raw);
  job.status = status;
  if (error) job.error = error;
  if (status === 'completed' || status === 'failed') job.completedAt = new Date();
  await redisConnection.set(KEY(jobId), serialize(job), 'EX', JOB_TTL);
}

export async function updateJobProgress(jobId: string, progress: number): Promise<void> {
  const raw = await redisConnection.get(KEY(jobId));
  if (!raw) throw new Error(`Job ${jobId} not found`);
  const job = deserialize(raw);
  job.progress = Math.min(100, Math.max(0, progress));
  await redisConnection.set(KEY(jobId), serialize(job), 'EX', JOB_TTL);
}

export async function setJobResult(
  jobId: string,
  result: CrawlResult | SingleUrlResult | MultiPageResult,
): Promise<void> {
  const raw = await redisConnection.get(KEY(jobId));
  if (!raw) throw new Error(`Job ${jobId} not found`);
  const job = deserialize(raw);
  job.result = result as CrawlResult;
  await redisConnection.set(KEY(jobId), serialize(job), 'EX', JOB_TTL);
}

export async function getJobStatus(jobId: string): Promise<JobState | undefined> {
  const raw = await redisConnection.get(KEY(jobId));
  if (!raw) return undefined;
  return deserialize(raw);
}

export async function getJobStats(): Promise<object> {
  const keys = await redisConnection.keys('job:*');
  const raws = keys.length ? await redisConnection.mget(...keys) : [];
  const states = raws.filter(Boolean).map((r) => deserialize(r!));
  return {
    total: states.length,
    queued: states.filter((j) => j.status === 'queued').length,
    processing: states.filter((j) => j.status === 'processing').length,
    completed: states.filter((j) => j.status === 'completed').length,
    failed: states.filter((j) => j.status === 'failed').length,
  };
}
