"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const winston_1 = __importDefault(require("winston"));
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.LOG_LEVEL || (NODE_ENV === 'production' ? 'info' : 'debug');
const LOG_FORMAT = process.env.LOG_FORMAT || (NODE_ENV === 'production' ? 'json' : 'simple');
const BALANCE_INJECTION_DEBUG = process.env.BALANCE_INJECTION_DEBUG === 'true';
const createLogFormat = () => {
    const baseFormat = winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }));
    if (LOG_FORMAT === 'json') {
        return winston_1.default.format.combine(baseFormat, winston_1.default.format.json());
    }
    else {
        return winston_1.default.format.combine(baseFormat, winston_1.default.format.colorize(), winston_1.default.format.simple());
    }
};
const logger = winston_1.default.createLogger({
    level: LOG_LEVEL,
    format: createLogFormat(),
    transports: [
        new winston_1.default.transports.Console({}),
    ],
});
class Logger {
    static info(message, correlationId, meta) {
        logger.info(message, { correlationId, ...meta });
    }
    static warn(message, correlationId, meta) {
        logger.warn(message, { correlationId, ...meta });
    }
    static error(message, correlationId, meta) {
        logger.error(message, { correlationId, ...meta });
    }
    static debug(message, correlationId, meta) {
        logger.debug(message, { correlationId, ...meta });
    }
    static balanceDebug(message, correlationId, meta) {
        if (BALANCE_INJECTION_DEBUG) {
            logger.debug(`[BALANCE] ${message}`, {
                correlationId,
                feature: 'balance_injection',
                ...meta,
            });
        }
    }
    static request(method, path, correlationId, meta) {
        logger.info(`${method} ${path}`, {
            correlationId,
            type: 'request',
            method,
            path,
            ...meta,
        });
    }
    static response(method, path, statusCode, correlationId, duration, meta) {
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
    static balanceMiddleware(action, correlationId, meta) {
        this.balanceDebug(`MIDDLEWARE: ${action}`, correlationId, meta);
    }
    static balanceSession(isNew, messageCount, correlationId, meta) {
        this.balanceDebug(`SESSION: isNew=${isNew} messages=${messageCount}`, correlationId, meta);
    }
    static balanceClient(isChatWise, userAgent, correlationId, meta) {
        this.balanceDebug(`CLIENT: isChatWise=${isChatWise} userAgent=${userAgent.substring(0, 50)}...`, correlationId, meta);
    }
    static balanceAuth(hasToken, isValid, correlationId, meta) {
        this.balanceDebug(`AUTH: hasToken=${hasToken} isValid=${isValid}`, correlationId, meta);
    }
    static balanceStream(isStreaming, correlationId, meta) {
        this.balanceDebug(`STREAM: isStreaming=${isStreaming}`, correlationId, meta);
    }
    static balanceEvent(event, correlationId, meta) {
        this.balanceDebug(`EVENT: ${event}`, correlationId, meta);
    }
    static balanceInfo(message, correlationId, meta) {
        logger.info(`[BALANCE] ${message}`, {
            correlationId,
            feature: 'balance_injection',
            ...meta,
        });
    }
    static balanceError(message, correlationId, error, meta) {
        logger.error(`[BALANCE] ${message}`, {
            correlationId,
            feature: 'balance_injection',
            error: error?.message,
            stack: error?.stack,
            ...meta,
        });
    }
}
exports.Logger = Logger;
exports.default = Logger;
//# sourceMappingURL=logger.js.map