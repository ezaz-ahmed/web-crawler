#!/usr/bin/env node

import { config, logConfig } from './config.js';
import { startServer, stopServer } from './server.js';
import { startWorkers, stopWorkers } from './worker.js';
import { closeQueues } from './queue.js';

console.log('╔════════════════════════════════════════╗');
console.log('║   Web Crawler API with AI Processing   ║');
console.log('╚════════════════════════════════════════╝\n');

// Log configuration
logConfig();
console.log('');

// Graceful shutdown handler
let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) {
    console.log('Already shutting down...');
    return;
  }

  isShuttingDown = true;
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  try {
    // Stop accepting new requests
    await stopServer();

    // Stop workers (finish current jobs, reject new ones)
    await stopWorkers();

    // Close queue connections
    await closeQueues();

    console.log('✓ Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit, but log for debugging
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  shutdown('UNCAUGHT_EXCEPTION');
});

// Start the application
async function start() {
  try {
    // Start workers first
    startWorkers();

    // Then start the API server
    await startServer();

    console.log('\n✓ Application started successfully!');
    console.log(`\nAPI Endpoints:`);
    console.log(`  - POST http://localhost:${config.port}/crawl/url`);
    console.log(`  - POST http://localhost:${config.port}/crawl/website`);
    console.log(`  - POST http://localhost:${config.port}/crawl/sitemap`);
    console.log(`  - GET  http://localhost:${config.port}/crawl/status/:jobId`);
    console.log(`  - GET  http://localhost:${config.port}/health`);
    console.log(`\nPress Ctrl+C to stop\n`);
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Run the application
start();
