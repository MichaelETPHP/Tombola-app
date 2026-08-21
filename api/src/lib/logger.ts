type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: unknown;
}

/**
 * Structured logger.
 * Outputs JSON in production, pretty-printed in development.
 */
class Logger {
  private isDev = process.env.NODE_ENV !== 'production';

  private log(level: LogLevel, message: string, data?: unknown): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(data !== undefined && { data }),
    };

    if (this.isDev) {
      const levelColors: Record<LogLevel, string> = {
        debug: '\x1b[36m', // cyan
        info: '\x1b[32m',  // green
        warn: '\x1b[33m',  // yellow
        error: '\x1b[31m', // red
      };
      const reset = '\x1b[0m';
      const color = levelColors[level];
      const prefix = `${color}[${level.toUpperCase()}]${reset}`;
      const time = `\x1b[90m${entry.timestamp}${reset}`;

      console.log(`${time} ${prefix} ${message}`);
      if (data !== undefined) {
        console.log(data);
      }
    } else {
      // JSON output for production log aggregation
      const stream = level === 'error' ? console.error : console.log;
      stream(JSON.stringify(entry));
    }
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.log('error', message, data);
  }
}

export const logger = new Logger();
