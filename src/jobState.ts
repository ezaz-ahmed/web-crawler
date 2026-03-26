import type { JobState, JobStatus, CrawlResult, CrawlType } from './types.js';

/**
 * In-memory job state storage.
 *
 * NOTE: For production with multiple workers, migrate this to Redis hashes.
 * Example Redis implementation:
 * - Key pattern: `job:{jobId}`
 * - Set TTL: 24-48 hours for auto-cleanup
 * - Use HSET/HGET for atomic updates
 *
 * For a single-process MVP, in-memory Map is sufficient and faster.
 */
class JobStateManager {
  private jobs: Map<string, JobState> = new Map();

  /**
   * Create a new job in the state store
   */
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

  /**
   * Update job status
   */
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

  /**
   * Update job progress (for multi-page crawls)
   */
  updateJobProgress(jobId: string, progress: number): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    job.progress = Math.min(100, Math.max(0, progress));
    this.jobs.set(jobId, job);
  }

  /**
   * Set job result
   */
  setJobResult(jobId: string, result: CrawlResult): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    job.result = result;
    this.jobs.set(jobId, job);
    console.log(`✓ Set result for job ${jobId}`);
  }

  /**
   * Get job state
   */
  getJobStatus(jobId: string): JobState | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Check if job exists
   */
  hasJob(jobId: string): boolean {
    return this.jobs.has(jobId);
  }

  /**
   * Delete job (for cleanup)
   */
  deleteJob(jobId: string): boolean {
    return this.jobs.delete(jobId);
  }

  /**
   * Get all jobs (for debugging/monitoring)
   */
  getAllJobs(): JobState[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get jobs by status
   */
  getJobsByStatus(status: JobStatus): JobState[] {
    return Array.from(this.jobs.values()).filter(
      (job) => job.status === status,
    );
  }

  /**
   * Clean up old completed/failed jobs
   * Call this periodically to prevent memory leaks
   */
  cleanupOldJobs(maxAgeHours: number = 24): number {
    const now = new Date();
    const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
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

  /**
   * Get stats about current jobs
   */
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

// Export singleton instance
export const jobStateManager = new JobStateManager();

// Optional: Schedule periodic cleanup (every hour)
if (typeof setInterval !== 'undefined') {
  setInterval(
    () => {
      jobStateManager.cleanupOldJobs(24);
    },
    60 * 60 * 1000,
  ); // Every hour
}
