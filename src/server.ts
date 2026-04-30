import { app } from './app.js';
import { config } from './config/env.js';

/**
 * Start the Fastify server
 */
export async function startServer(): Promise<void> {
  try {
    await app.listen({
      port: config.port,
      host: '0.0.0.0',
    });
    console.log(`✓ Server listening on port ${config.port}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

/**
 * Stop the Fastify server
 */
export async function stopServer(): Promise<void> {
  await app.close();
  console.log('Server stopped');
}
