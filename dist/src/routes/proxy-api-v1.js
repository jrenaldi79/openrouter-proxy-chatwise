"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiV1ProxyHandler = apiV1ProxyHandler;
const services_1 = require("../config/services");
const logger_1 = require("../utils/logger");
const proxy_utils_1 = require("./proxy-utils");
async function apiV1ProxyHandler(req, res, next) {
    if ((req.path === '/me/credits' || req.path === '/credits') &&
        req.method === 'GET') {
        return next();
    }
    const correlationId = req.correlationId;
    try {
        const { errorResponse } = (0, proxy_utils_1.validateAuth)(req);
        if (errorResponse) {
            res.status(401).json(errorResponse);
            return;
        }
        const fullPath = `/api/v1${req.path}`;
        const openRouterRequest = (0, proxy_utils_1.createOpenRouterRequest)(req, fullPath, correlationId);
        const proxyResponse = await services_1.proxyService.makeRequest(openRouterRequest);
        if (proxyResponse.status >= 400) {
            if (proxyResponse.status === 401 &&
                proxyResponse.data &&
                typeof proxyResponse.data === 'object' &&
                'error' in proxyResponse.data) {
                res.set('x-correlation-id', correlationId);
                res.status(401).json(proxyResponse.data);
                return;
            }
            const { code: errorCode, statusCode } = (0, proxy_utils_1.mapStatusToErrorCode)(proxyResponse.status);
            const errorResponse = {
                error: {
                    code: errorCode,
                    message: typeof proxyResponse.data === 'object' &&
                        proxyResponse.data &&
                        'error' in proxyResponse.data
                        ? proxyResponse.data.error
                            .message || 'OpenRouter API error'
                        : 'OpenRouter API error',
                    correlationId,
                },
            };
            res.status(statusCode).json(errorResponse);
            return;
        }
        const responseHeaders = { ...proxyResponse.headers };
        delete responseHeaders['transfer-encoding'];
        res.status(proxyResponse.status).set(responseHeaders);
        if (proxyResponse.data !== undefined) {
            res.json(proxyResponse.data);
        }
        else {
            res.end();
        }
    }
    catch (error) {
        logger_1.Logger.error('Proxy API error', correlationId, {
            error: error instanceof Error ? error.message : String(error),
        });
        const errorResponse = (0, proxy_utils_1.createErrorResponse)(502, 'OpenRouter API unavailable', correlationId);
        res.status(502).json(errorResponse);
    }
}
//# sourceMappingURL=proxy-api-v1.js.map