import type { WebhookPayload } from './types.js';

const MAX_ATTEMPTS = 3;
const WEBHOOK_TIMEOUT_MS = 10_000;

/**
 * Attempt to deliver a webhook payload to the given URL.
 * Retries up to MAX_ATTEMPTS times with exponential backoff (1s, 2s, 4s).
 * Errors are logged but never propagated — webhook failure must never fail a crawl job.
 */
export async function sendWebhook(
  callbackUrl: string,
  payload: WebhookPayload,
): Promise<void> {
  const body = JSON.stringify(payload);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    try {
      const res = await fetch(callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.ok) {
        console.log(
          `✓ Webhook delivered [${payload.event}] job=${payload.jobId} attempt=${attempt}`,
        );
        return;
      }

      console.warn(
        `⚠ Webhook non-OK [${payload.event}] job=${payload.jobId} attempt=${attempt} status=${res.status}`,
      );
    } catch (err) {
      clearTimeout(timer);
      console.warn(
        `⚠ Webhook error [${payload.event}] job=${payload.jobId} attempt=${attempt}:`,
        (err as Error).message,
      );
    }

    if (attempt < MAX_ATTEMPTS) {
      const delayMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  console.error(
    `✗ Webhook failed after ${MAX_ATTEMPTS} attempts [${payload.event}] job=${payload.jobId}`,
  );
}

/**
 * Fire-and-forget wrapper — schedules delivery without blocking the caller.
 */
export function dispatchWebhook(
  callbackUrl: string | undefined,
  payload: WebhookPayload,
): void {
  if (!callbackUrl) return;
  sendWebhook(callbackUrl, payload).catch(() => {
    // already logged inside sendWebhook — swallow here
  });
}
