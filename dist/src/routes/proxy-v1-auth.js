"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.v1AuthKeyHandler = v1AuthKeyHandler;
const services_1 = require("../config/services");
const proxy_utils_1 = require("./proxy-utils");
async function v1AuthKeyHandler(req, res) {
    const correlationId = req.correlationId;
    try {
        const fullPath = req.path.replace('/v1', '/api/v1');
        const openRouterRequest = (0, proxy_utils_1.createOpenRouterRequest)(req, fullPath, correlationId);
        const proxyResponse = await services_1.proxyService.makeRequest(openRouterRequest);
        if (proxyResponse.status >= 400) {
            const errorResponse = {
                error: {
                    code: 'UPSTREAM_ERROR',
                    message: typeof proxyResponse.data === 'object' &&
                        proxyResponse.data &&
                        'error' in proxyResponse.data
                        ? proxyResponse.data.error
                            .message || 'OpenRouter API error'
                        : 'OpenRouter API error',
                    correlationId,
                },
            };
            (0, proxy_utils_1.sendCleanResponse)(res, proxyResponse.status, errorResponse, correlationId);
            return;
        }
        (0, proxy_utils_1.sendCleanResponse)(res, proxyResponse.status, proxyResponse.data, correlationId);
    }
    catch (error) {
        const errorResponse = {
            error: {
                code: 'UPSTREAM_ERROR',
                message: error instanceof Error ? error.message : 'OpenRouter API unavailable',
                correlationId,
            },
        };
        (0, proxy_utils_1.sendCleanResponse)(res, 502, errorResponse, correlationId);
    }
}
//# sourceMappingURL=proxy-v1-auth.js.map