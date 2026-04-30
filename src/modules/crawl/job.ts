import type {
  CrawlResult,
  CrawlType,
  JobState,
  JobStatus,
  MultiPageResult,
  SingleUrlResult,
} from '../../types.js';

class JobStateManager {
  private jobs: Map<string, JobState> = new Map();

  createJob(jobId: string, type: CrawlType): JobState {
    const state: JobState = {
      jobId,
      type,
      status: 'queued',
      createdAt: new Date(),
    };

    this.jobs.set(jobId, state);
    console.log(`✓ Created job state for ${jobId}`);
    return state;
  }

  updateJobStatus(jobId: string, status: JobStatus, error?: string): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    job.status = status;
    if (error) {
      job.error = error;
    }

    if (status === 'completed' || status === 'failed') {
      job.completedAt = new Date();
    }

    this.jobs.set(jobId, job);
    console.log(`✓ Updated job ${jobId} status to ${status}`);
  }

  updateJobProgress(jobId: string, progress: number): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    job.progress = Math.min(100, Math.max(0, progress));
    this.jobs.set(jobId, job);
  }

  setJobResult(jobId: string, result: CrawlResult): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    job.result = result;
    this.jobs.set(jobId, job);
    console.log(`✓ Set result for job ${jobId}`);
  }

  getJobStatus(jobId: string): JobState | undefined {
    return this.jobs.get(jobId);
  }

  cleanupOldJobs(maxAgeHours: number = 24): number {
    const now = new Date();
    const maxAge = maxAgeHours * 60 * 60 * 1000;
    let deletedCount = 0;

    for (const [jobId, job] of this.jobs.entries()) {
      if (job.completedAt) {
        const age = now.getTime() - job.completedAt.getTime();
        if (age > maxAge) {
          this.jobs.delete(jobId);
          deletedCount++;
        }
      }
    }

    if (deletedCount > 0) {
      console.log(`✓ Cleaned up ${deletedCount} old jobs`);
    }

    return deletedCount;
  }

  getStats() {
    const jobs = Array.from(this.jobs.values());
    return {
      total: jobs.length,
      queued: jobs.filter((j) => j.status === 'queued').length,
      processing: jobs.filter((j) => j.status === 'processing').length,
      completed: jobs.filter((j) => j.status === 'completed').length,
      failed: jobs.filter((j) => j.status === 'failed').length,
    };
  }
}

const jobStateManager = new JobStateManager();

export function createJobState(jobId: string, type: CrawlType): JobState {
  return jobStateManager.createJob(jobId, type);
}

export function updateJobStatus(
  jobId: string,
  status: JobStatus,
  error?: string,
): void {
  jobStateManager.updateJobStatus(jobId, status, error);
}

export function updateJobProgress(jobId: string, progress: number): void {
  jobStateManager.updateJobProgress(jobId, progress);
}

export function setJobResult(
  jobId: string,
  result: CrawlResult | SingleUrlResult | MultiPageResult,
): void {
  jobStateManager.setJobResult(jobId, result);
}

export function getJobStatus(jobId: string): JobState | undefined {
  return jobStateManager.getJobStatus(jobId);
}

export function getJobStats() {
  return jobStateManager.getStats();
}

if (typeof setInterval !== 'undefined') {
  setInterval(
    () => {
      jobStateManager.cleanupOldJobs(24);
    },
    60 * 60 * 1000,
  );
}
