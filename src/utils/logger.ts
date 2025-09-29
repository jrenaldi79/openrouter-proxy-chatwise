import winston from 'winston';

// Environment-based configuration
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL =
  process.env.LOG_LEVEL || (NODE_ENV === 'production' ? 'info' : 'debug');
const LOG_FORMAT =
  process.env.LOG_FORMAT || (NODE_ENV === 'production' ? 'json' : 'simple');
const BALANCE_INJECTION_DEBUG = process.env.BALANCE_INJECTION_DEBUG === 'true';

// Create format based on LOG_FORMAT environment variable
const createLogFormat = (): winston.Logform.Format => {
  const baseFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true })
  );

  if (LOG_FORMAT === 'json') {
    return winston.format.combine(baseFormat, winston.format.json());
  } else {
    return winston.format.combine(
      baseFormat,
      winston.format.colorize(),
      winston.format.simple()
    );
  }
};

// Create the winston logger instance
const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: createLogFormat(),
  transports: [
    new winston.transports.Console({
      silent: process.env.NODE_ENV === 'test',
    }),
  ],
});

// Logger utility class with correlation ID support
export class Logger {
  static info(
    message: string,
    correlationId?: string,
    meta?: Record<string, unknown>
  ): void {
    logger.info(message, { correlationId, ...meta });
  }

  static warn(
    message: string,
    correlationId?: string,
    meta?: Record<string, unknown>
  ): void {
    logger.warn(message, { correlationId, ...meta });
  }

  static error(
    message: string,
    correlationId?: string,
    meta?: Record<string, unknown>
  ): void {
    logger.error(message, { correlationId, ...meta });
  }

  static debug(
    message: string,
    correlationId?: string,
    meta?: Record<string, unknown>
  ): void {
    logger.debug(message, { correlationId, ...meta });
  }

  // Specialized logging for balance injection debugging
  static balanceDebug(
    message: string,
    correlationId?: string,
    meta?: Record<string, unknown>
  ): void {
    if (BALANCE_INJECTION_DEBUG) {
      logger.debug(`[BALANCE] ${message}`, {
        correlationId,
        feature: 'balance_injection',
        ...meta,
      });
    }
  }

  // Request/response logging
  static request(
    method: string,
    path: string,
    correlationId: string,
    meta?: Record<string, unknown>
  ): void {
    logger.info(`${method} ${path}`, {
      correlationId,
      type: 'request',
      method,
      path,
      ...meta,
    });
  }

  static response(
    method: string,
    path: string,
    statusCode: number,
    correlationId: string,
    duration?: number,
    meta?: Record<string, unknown>
  ): void {
    const level = statusCode >= 400 ? 'warn' : 'info';
    logger[level](`${method} ${path} ${statusCode}`, {
      correlationId,
      type: 'response',
      method,
      path,
      statusCode,
      duration,
      ...meta,
    });
  }

  // Balance injection specific logging methods
  static balanceMiddleware(
    action: string,
    correlationId: string,
    meta?: Record<string, unknown>
  ): void {
    this.balanceDebug(`MIDDLEWARE: ${action}`, correlationId, meta);
  }

  static balanceSession(
    isNew: boolean,
    messageCount: number,
    correlationId: string,
    meta?: Record<string, unknown>
  ): void {
    this.balanceDebug(
      `SESSION: isNew=${isNew} messages=${messageCount}`,
      correlationId,
      meta
    );
  }

  static balanceClient(
    isChatWise: boolean,
    userAgent: string,
    correlationId: string,
    meta?: Record<string, unknown>
  ): void {
    this.balanceDebug(
      `CLIENT: isChatWise=${isChatWise} userAgent=${userAgent.substring(0, 50)}...`,
      correlationId,
      meta
    );
  }

  static balanceAuth(
    hasToken: boolean,
    isValid: boolean,
    correlationId: string,
    meta?: Record<string, unknown>
  ): void {
    this.balanceDebug(
      `AUTH: hasToken=${hasToken} isValid=${isValid}`,
      correlationId,
      meta
    );
  }

  static balanceStream(
    isStreaming: boolean,
    correlationId: string,
    meta?: Record<string, unknown>
  ): void {
    this.balanceDebug(
      `STREAM: isStreaming=${isStreaming}`,
      correlationId,
      meta
    );
  }

  static balanceEvent(
    event: string,
    correlationId: string,
    meta?: Record<string, unknown>
  ): void {
    this.balanceDebug(`EVENT: ${event}`, correlationId, meta);
  }

  // Production-level balance injection logging (always enabled)
  static balanceInfo(
    message: string,
    correlationId: string,
    meta?: Record<string, unknown>
  ): void {
    logger.info(`[BALANCE] ${message}`, {
      correlationId,
      feature: 'balance_injection',
      ...meta,
    });
  }

  static balanceError(
    message: string,
    correlationId: string,
    error?: Error,
    meta?: Record<string, unknown>
  ): void {
    logger.error(`[BALANCE] ${message}`, {
      correlationId,
      feature: 'balance_injection',
      error: error?.message,
      stack: error?.stack,
      ...meta,
    });
  }
}

export default Logger;
