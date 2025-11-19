"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.v1CreditsHandler = exports.apiCreditsHandler = exports.meCreditsHandler = void 0;
exports.creditsMethodValidation = creditsMethodValidation;
const CreditResponse_1 = require("../models/CreditResponse");
const AuthToken_1 = require("../models/AuthToken");
const OpenRouterRequest_1 = require("../models/OpenRouterRequest");
const services_1 = require("../config/services");
const environment_1 = require("../config/environment");
function creditsMethodValidation(req, res, next) {
    if (req.method !== 'GET') {
        const correlationId = req.correlationId;
        const errorResponse = CreditResponse_1.CreditResponse.createErrorResponse('METHOD_NOT_ALLOWED', 'Only GET method is allowed for this endpoint', 405, correlationId);
        res
            .status(errorResponse.status)
            .set(errorResponse.headers)
            .json(errorResponse.body);
        return;
    }
    next();
}
async function handleCreditRequest(req, res) {
    const correlationId = req.correlationId;
    try {
        const authToken = AuthToken_1.AuthToken.fromRequest(req);
        if (!authToken || !authToken.isValid) {
            const errorResponse = CreditResponse_1.CreditResponse.createErrorResponse('UNAUTHORIZED', authToken ? 'Invalid API key format' : 'Authorization header required', 401, correlationId);
            res
                .status(errorResponse.status)
                .set(errorResponse.headers)
                .json(errorResponse.body);
            return;
        }
        const keyRequest = OpenRouterRequest_1.OpenRouterRequest.createKeyRequest(authToken.getAuthorizationHeader(), environment_1.envConfig.OPENROUTER_BASE_URL, environment_1.envConfig.REQUEST_TIMEOUT_MS, correlationId);
        const proxyResponse = await services_1.proxyService.makeRequest(keyRequest);
        if (proxyResponse.status >= 400) {
            let errorCode = 'UPSTREAM_ERROR';
            let statusCode = proxyResponse.status;
            if (proxyResponse.status === 400) {
                errorCode = 'BAD_REQUEST';
            }
            else if (proxyResponse.status === 401) {
                errorCode = 'UNAUTHORIZED';
            }
            else if (proxyResponse.status === 402) {
                errorCode = 'INSUFFICIENT_CREDITS';
            }
            else if (proxyResponse.status === 404) {
                errorCode = 'NOT_FOUND';
            }
            else if (proxyResponse.status === 408) {
                errorCode = 'REQUEST_TIMEOUT';
            }
            else if (proxyResponse.status === 429) {
                errorCode = 'RATE_LIMIT_EXCEEDED';
            }
            else if (proxyResponse.status >= 500) {
                statusCode = 502;
            }
            const errorResponse = CreditResponse_1.CreditResponse.createErrorResponse(errorCode, typeof proxyResponse.data === 'object' &&
                proxyResponse.data &&
                'error' in proxyResponse.data
                ? proxyResponse.data.error
                    .message || 'OpenRouter API error'
                : 'OpenRouter API unavailable', statusCode, correlationId);
            if (proxyResponse.status === 429 &&
                proxyResponse.headers['retry-after']) {
                errorResponse.headers['Retry-After'] =
                    proxyResponse.headers['retry-after'];
            }
            res
                .status(errorResponse.status)
                .set(errorResponse.headers)
                .json(errorResponse.body);
            return;
        }
        const openRouterResponse = proxyResponse.data;
        const keyData = openRouterResponse.data;
        const validatedData = CreditResponse_1.CreditResponse.validateKeyResponseData(keyData);
        const creditResponse = CreditResponse_1.CreditResponse.fromKeyResponse(validatedData, correlationId, proxyResponse.headers);
        const response = creditResponse
            .withCacheHeaders('MISS')
            .toExpressResponse();
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'X-Correlation-Id': correlationId,
        });
        res.end(JSON.stringify(response.body));
        return;
    }
    catch (error) {
        const errorResponse = CreditResponse_1.CreditResponse.createErrorResponse('INTERNAL_ERROR', error instanceof Error ? error.message : 'Internal server error', 500, correlationId);
        res
            .status(errorResponse.status)
            .set(errorResponse.headers)
            .json(errorResponse.body);
    }
}
exports.meCreditsHandler = handleCreditRequest;
exports.apiCreditsHandler = handleCreditRequest;
exports.v1CreditsHandler = handleCreditRequest;
//# sourceMappingURL=credits.js.map