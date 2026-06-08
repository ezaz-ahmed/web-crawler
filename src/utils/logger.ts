type LogLevel = 'info' | 'warn' | 'error';

function formatLog(level: LogLevel, objOrMsg: unknown, msg?: string): string {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}]`;

  if (msg !== undefined) {
    // pino-style: logger.error({ key: val }, 'message')
    let fields = '';
    try {
      fields = JSON.stringify(objOrMsg);
    } catch {
      fields = String(objOrMsg);
    }
    return `${prefix} ${msg} ${fields}`;
  }

  // simple: logger.info('message')
  if (typeof objOrMsg === 'string') {
    return `${prefix} ${objOrMsg}`;
  }

  try {
    return `${prefix} ${JSON.stringify(objOrMsg)}`;
  } catch {
    return `${prefix} ${String(objOrMsg)}`;
  }
}

export const logger = {
  info(objOrMsg: unknown, msg?: string) {
    process.stdout.write(formatLog('info', objOrMsg, msg) + '\n');
  },
  warn(objOrMsg: unknown, msg?: string) {
    process.stdout.write(formatLog('warn', objOrMsg, msg) + '\n');
  },
  error(objOrMsg: unknown, msg?: string) {
    process.stdout.write(formatLog('error', objOrMsg, msg) + '\n');
  },
};
