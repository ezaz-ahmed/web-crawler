#!/usr/bin/env node

import { logConfig } from './config.js';
import { closeQueues } from './queue.js';
import { stopWorkers, startWorkers } from './workers/crawl.worker.js';

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
    console.log('✓ Worker shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during worker shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  shutdown('UNCAUGHT_EXCEPTION');
});

function start() {
  try {
    startWorkers();
    console.log('✓ Worker process started');
    console.log('\nPress Ctrl+C to stop\n');
  } catch (error) {
    console.error('Failed to start workers:', error);
    process.exit(1);
  }
}

start();
