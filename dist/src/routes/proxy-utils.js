"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAuth = validateAuth;
exports.createOpenRouterRequest = createOpenRouterRequest;
exports.mapStatusToErrorCode = mapStatusToErrorCode;
exports.createErrorResponse = createErrorResponse;
exports.sendCleanResponse = sendCleanResponse;
const AuthToken_1 = require("../models/AuthToken");
const OpenRouterRequest_1 = require("../models/OpenRouterRequest");
const environment_1 = require("../config/environment");
function validateAuth(req) {
    const correlationId = req.correlationId;
    const authToken = AuthToken_1.AuthToken.fromRequest(req);
    if (!authToken || !authToken.isValid) {
        const errorResponse = {
            error: {
                code: 'UNAUTHORIZED',
                message: authToken
                    ? 'Invalid API key format'
                    : 'Authorization header required',
                correlationId,
            },
        };
        return { authToken: null, errorResponse };
    }
    return { authToken, errorResponse: null };
}
function createOpenRouterRequest(req, targetPath, correlationId) {
    return OpenRouterRequest_1.OpenRouterRequest.fromProxyRequest({
        method: req.method,
        path: targetPath,
        headers: req.headers,
        body: req.body,
        query: req.query,
    }, environment_1.envConfig.OPENROUTER_BASE_URL, environment_1.envConfig.REQUEST_TIMEOUT_MS).withCorrelationId(correlationId);
}
function mapStatusToErrorCode(status) {
    let errorCode = 'UPSTREAM_ERROR';
    let statusCode = status;
    if (status === 400) {
        errorCode = 'BAD_REQUEST';
    }
    else if (status === 401) {
        errorCode = 'UNAUTHORIZED';
    }
    else if (status === 402) {
        errorCode = 'INSUFFICIENT_CREDITS';
    }
    else if (status === 404) {
        errorCode = 'NOT_FOUND';
    }
    else if (status === 408) {
        errorCode = 'REQUEST_TIMEOUT';
    }
    else if (status === 429) {
        errorCode = 'RATE_LIMIT_EXCEEDED';
    }
    else if (status >= 500) {
        statusCode = 502;
    }
    return { code: errorCode, statusCode };
}
function createErrorResponse(status, data, correlationId) {
    const { code } = mapStatusToErrorCode(status);
    return {
        error: {
            code,
            message: typeof data === 'object' && data && 'error' in data
                ? data.error.message ||
                    'OpenRouter API error'
                : 'OpenRouter API error',
            correlationId,
        },
    };
}
function sendCleanResponse(res, status, data, correlationId) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Correlation-Id': correlationId,
    });
    res.end(JSON.stringify(data));
}
//# sourceMappingURL=proxy-utils.js.map