"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenRouterRequest = void 0;
class OpenRouterRequest {
    constructor(data) {
        this.url = data.url;
        this.method = data.method.toUpperCase();
        this.headers = { ...data.headers };
        this.body = data.body;
        this.timeout = data.timeout;
        this.retryConfig =
            data.retryConfig ?? OpenRouterRequest.DEFAULT_RETRY_CONFIG;
        this.validate();
    }
    validate() {
        if (!this.isValidOpenRouterUrl(this.url)) {
            throw new Error(`Invalid OpenRouter URL: ${this.url}`);
        }
        const validMethods = [
            'GET',
            'POST',
            'PUT',
            'DELETE',
            'PATCH',
            'HEAD',
            'OPTIONS',
        ];
        if (!validMethods.includes(this.method)) {
            throw new Error(`Invalid HTTP method: ${this.method}`);
        }
        if (this.timeout <= 0 || this.timeout > 300000) {
            throw new Error(`Invalid timeout: ${this.timeout}ms`);
        }
        if (this.requiresAuthentication() && !this.getAuthorizationHeader()) {
            throw new Error('Authorization header required for authenticated endpoints');
        }
        this.validateRetryConfig();
    }
    isValidOpenRouterUrl(url) {
        try {
            const parsedUrl = new URL(url);
            return (parsedUrl.hostname === 'openrouter.ai' &&
                parsedUrl.protocol === 'https:');
        }
        catch {
            return false;
        }
    }
    requiresAuthentication() {
        const publicEndpoints = ['/health', '/status', '/ping'];
        const path = new URL(this.url).pathname;
        return !publicEndpoints.includes(path);
    }
    validateRetryConfig() {
        const { maxRetries, baseDelay, maxDelay, backoffMultiplier } = this.retryConfig;
        if (maxRetries < 0 || maxRetries > 10) {
            throw new Error(`Invalid maxRetries: ${maxRetries}`);
        }
        if (baseDelay < 0 || baseDelay > 60000) {
            throw new Error(`Invalid baseDelay: ${baseDelay}ms`);
        }
        if (maxDelay < baseDelay || maxDelay > 300000) {
            throw new Error(`Invalid maxDelay: ${maxDelay}ms`);
        }
        if (backoffMultiplier < 1 || backoffMultiplier > 10) {
            throw new Error(`Invalid backoffMultiplier: ${backoffMultiplier}`);
        }
    }
    getAuthorizationHeader() {
        return this.headers['authorization'] || this.headers['Authorization'];
    }
    getApiKey() {
        const authHeader = this.getAuthorizationHeader();
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return undefined;
        }
        return authHeader.substring(7);
    }
    getContentType() {
        return this.headers['content-type'] || this.headers['Content-Type'];
    }
    getCorrelationId() {
        return this.headers['x-correlation-id'] || this.headers['X-Correlation-Id'];
    }
    calculateRetryDelay(attemptNumber) {
        if (attemptNumber >= this.retryConfig.maxRetries) {
            return 0;
        }
        const delay = this.retryConfig.baseDelay *
            Math.pow(this.retryConfig.backoffMultiplier, attemptNumber);
        return Math.min(delay, this.retryConfig.maxDelay);
    }
    shouldRetry(attemptNumber, error) {
        if (attemptNumber >= this.retryConfig.maxRetries) {
            return false;
        }
        const retryableErrors = [
            'ECONNRESET',
            'ENOTFOUND',
            'ECONNREFUSED',
            'ETIMEDOUT',
            'TIMEOUT',
        ];
        const errorMessage = error.message.toUpperCase();
        return retryableErrors.some(retryableError => errorMessage.includes(retryableError));
    }
    shouldRetryHttpStatus(statusCode) {
        const retryableStatusCodes = [500, 502, 503, 504, 429];
        return retryableStatusCodes.includes(statusCode);
    }
    withUpdatedHeaders(newHeaders) {
        return new OpenRouterRequest({
            url: this.url,
            method: this.method,
            headers: { ...this.headers, ...newHeaders },
            body: this.body,
            timeout: this.timeout,
            retryConfig: this.retryConfig,
        });
    }
    withCorrelationId(correlationId) {
        return this.withUpdatedHeaders({ 'X-Correlation-Id': correlationId });
    }
    toJSON() {
        return {
            url: this.url,
            method: this.method,
            headers: this.headers,
            body: this.body,
            timeout: this.timeout,
            retryConfig: this.retryConfig,
        };
    }
    static fromProxyRequest(proxyRequest, baseUrl, timeout, retryConfig) {
        const url = new URL(proxyRequest.path, baseUrl);
        Object.entries(proxyRequest.query).forEach(([key, value]) => {
            url.searchParams.set(key, value);
        });
        return new OpenRouterRequest({
            url: url.toString(),
            method: proxyRequest.method,
            headers: proxyRequest.headers,
            body: proxyRequest.body,
            timeout,
            retryConfig,
        });
    }
    static createKeyRequest(authorizationHeader, baseUrl, timeout, correlationId, retryConfig) {
        const url = new URL('/api/v1/key', baseUrl);
        return new OpenRouterRequest({
            url: url.toString(),
            method: 'GET',
            headers: {
                Authorization: authorizationHeader,
                'Content-Type': 'application/json',
                'X-Correlation-Id': correlationId,
            },
            timeout,
            retryConfig,
        });
    }
}
exports.OpenRouterRequest = OpenRouterRequest;
OpenRouterRequest.DEFAULT_RETRY_CONFIG = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
};
//# sourceMappingURL=OpenRouterRequest.js.map