type LogLevel = 'info' | 'warn' | 'error';

function formatMessage(level: LogLevel, message: string): string {
  const ts = new Date().toISOString();
  return `[${ts}] [${level.toUpperCase()}] ${message}`;
}

export const logger = {
  info(message: string, ...args: unknown[]) {
    console.log(formatMessage('info', message), ...args);
  },
  warn(message: string, ...args: unknown[]) {
    console.warn(formatMessage('warn', message), ...args);
  },
  error(message: string, ...args: unknown[]) {
    console.error(formatMessage('error', message), ...args);
  },
};
