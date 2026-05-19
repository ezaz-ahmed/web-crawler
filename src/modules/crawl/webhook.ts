import type { WebhookPayload } from '../../types.js';
import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_ATTEMPTS = 3;
const WEBHOOK_TIMEOUT_MS = 10_000;
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

const WEBHOOK_SIGNATURE_HEADER = 'X-Webhook-Signature';
const WEBHOOK_TIMESTAMP_HEADER = 'X-Webhook-Timestamp';

function signWebhookPayload(
  timestampSeconds: string,
  body: string,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(`${timestampSeconds}.${body}`)
    .digest('hex');
}

function buildWebhookHeaders(
  body: string,
  secret?: string,
): Record<string, string> {
  const timestampSeconds = Math.floor(Date.now() / 1000).toString();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    [WEBHOOK_TIMESTAMP_HEADER]: timestampSeconds,
  };

  if (!secret) {
    return headers;
  }

  const signature = signWebhookPayload(timestampSeconds, body, secret);

  headers[WEBHOOK_SIGNATURE_HEADER] = `v1=${signature}`;
  return headers;
}

function constantTimeEquals(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}

/**
 * Verify webhook timestamp freshness and signature on recipient side.
 */
export function verifyWebhookSignature(options: {
  body: string;
  signatureHeader?: string | null;
  timestampHeader?: string | null;
  secret: string;
  nowMs?: number;
  toleranceSeconds?: number;
}): boolean {
  const {
    body,
    signatureHeader,
    timestampHeader,
    secret,
    nowMs = Date.now(),
    toleranceSeconds = WEBHOOK_TOLERANCE_SECONDS,
  } = options;

  if (!signatureHeader || !timestampHeader) {
    return false;
  }

  const timestampSeconds = Number.parseInt(timestampHeader, 10);
  if (!Number.isFinite(timestampSeconds)) {
    return false;
  }

  const ageSeconds = Math.abs(Math.floor(nowMs / 1000) - timestampSeconds);
  if (ageSeconds > toleranceSeconds) {
    return false;
  }

  const providedSignature = signatureHeader.startsWith('v1=')
    ? signatureHeader.slice(3)
    : signatureHeader;

  if (!providedSignature) {
    return false;
  }

  const expectedSignature = signWebhookPayload(timestampHeader, body, secret);
  return constantTimeEquals(providedSignature, expectedSignature);
}

/**
 * Attempt to deliver a webhook payload to the given URL.
 * Retries up to MAX_ATTEMPTS times with exponential backoff (1s, 2s, 4s).
 * Errors are logged but never propagated — webhook failure must never fail a crawl job.
 */
export async function sendWebhook(
  callbackUrl: string,
  payload: WebhookPayload,
  secret?: string,
): Promise<void> {
  const body = JSON.stringify(payload);
  const headers = buildWebhookHeaders(body, secret);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    try {
      const res = await fetch(callbackUrl, {
        method: 'POST',
        headers,
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
      const delayMs = Math.pow(2, attempt - 1) * 1000;
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
  secret?: string,
): void {
  if (!callbackUrl) return;

  sendWebhook(callbackUrl, payload, secret).catch(() => {
    // already logged inside sendWebhook — swallow here
  });
}
