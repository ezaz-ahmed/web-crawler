#!/usr/bin/env node

import { logConfig } from './config.js';
import { closeQueues } from './queue.js';
import { stopWorkers, startWorkers } from './workers/crawl.worker.js';
import { logger } from './utils/logger.js';

logConfig();
console.log('');

let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) {
    console.log('Already shutting down...');
    return;
  }

  isShuttingDown = true;
  console.log(`\n${signal} received. Starting worker shutdown...`);

  try {
    await stopWorkers();
    await closeQueues();
    logger.info('✓ Worker shutdown complete');
    process.exit(0);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    logger.error({ signal, error: errMsg, stack: errStack }, `Error during worker shutdown: ${errMsg}`);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  const errMsg = reason instanceof Error ? reason.message : String(reason);
  const errStack = reason instanceof Error ? reason.stack : undefined;
  logger.error(
    { error: errMsg, stack: errStack, promise: String(promise) },
    `Unhandled Rejection: ${errMsg}`,
  );
});

process.on('uncaughtException', (error) => {
  logger.error(
    { error: error.message, stack: error.stack },
    `Uncaught Exception: ${error.message}`,
  );
  shutdown('UNCAUGHT_EXCEPTION');
});

function start() {
  try {
    startWorkers();
    logger.info('✓ Worker process started. Press Ctrl+C to stop.');
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    logger.error({ error: errMsg, stack: errStack }, `Failed to start workers: ${errMsg}`);
    process.exit(1);
  }
}

start();
