"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreditResponse = void 0;
class CreditResponse {
    constructor(responseData) {
        this.data = { ...responseData.data };
        this.status = responseData.status || 200;
        this.headers = responseData.headers || {};
        this.validate();
    }
    validate() {
        if (typeof this.data.total_credits !== 'number') {
            throw new Error('total_credits must be a number');
        }
        if (typeof this.data.total_usage !== 'number') {
            throw new Error('total_usage must be a number');
        }
        if (this.data.total_credits < 0) {
            throw new Error('total_credits must be non-negative');
        }
        if (this.data.total_usage < 0) {
            throw new Error('total_usage must be non-negative');
        }
        if (this.status < 100 || this.status > 599) {
            throw new Error(`Invalid HTTP status code: ${this.status}`);
        }
    }
    isUnlimitedAccount() {
        return this.data.total_credits === 999999;
    }
    getRemainingCredits() {
        if (this.isUnlimitedAccount()) {
            return Number.POSITIVE_INFINITY;
        }
        return Math.max(0, this.data.total_credits - this.data.total_usage);
    }
    getUsagePercentage() {
        if (this.isUnlimitedAccount()) {
            return 0;
        }
        if (this.data.total_credits === 0) {
            return this.data.total_usage > 0 ? 100 : 0;
        }
        return (this.data.total_usage / this.data.total_credits) * 100;
    }
    isNearLimit(threshold = 0.9) {
        if (this.isUnlimitedAccount()) {
            return false;
        }
        return this.getUsagePercentage() >= threshold * 100;
    }
    hasExceededLimit() {
        if (this.isUnlimitedAccount()) {
            return false;
        }
        return this.data.total_usage > this.data.total_credits;
    }
    toJSON() {
        return {
            data: {
                total_credits: this.data.total_credits,
                total_usage: this.data.total_usage,
            },
        };
    }
    toExpressResponse() {
        return {
            status: this.status,
            headers: {
                'Content-Type': 'application/json',
                ...this.headers,
            },
            body: this.toJSON(),
        };
    }
    static fromKeyResponse(keyResponse, correlationId, preservedHeaders) {
        const total_credits = keyResponse.limit === null ? 999999 : keyResponse.limit;
        const total_usage = keyResponse.usage;
        const headers = {
            'Content-Type': 'application/json',
        };
        if (correlationId) {
            headers['X-Correlation-Id'] = correlationId;
        }
        if (preservedHeaders) {
            const headersToPreserve = ['x-ratelimit-remaining', 'x-ratelimit-reset'];
            headersToPreserve.forEach(header => {
                const value = preservedHeaders[header] || preservedHeaders[header.toLowerCase()];
                if (value) {
                    headers[header] = value;
                }
            });
        }
        return new CreditResponse({
            data: {
                total_credits,
                total_usage,
            },
            status: 200,
            headers,
        });
    }
    static createErrorResponse(errorCode, errorMessage, statusCode, correlationId) {
        return {
            status: statusCode,
            headers: {
                'Content-Type': 'application/json',
                'X-Correlation-Id': correlationId,
            },
            body: {
                error: {
                    code: errorCode,
                    message: errorMessage,
                    correlationId,
                },
            },
        };
    }
    withHeaders(additionalHeaders) {
        return new CreditResponse({
            data: this.data,
            status: this.status,
            headers: { ...this.headers, ...additionalHeaders },
        });
    }
    withCacheHeaders(cacheStatus) {
        return this.withHeaders({
            'X-Cache': cacheStatus,
            'Cache-Control': cacheStatus === 'HIT' ? 'public, max-age=30' : 'no-cache',
        });
    }
    static validateKeyResponseData(data) {
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid key response data: not an object');
        }
        const keyData = data;
        if (typeof keyData.usage !== 'number') {
            throw new Error('Invalid key response data: usage must be a number');
        }
        if (keyData.usage < 0) {
            throw new Error('Invalid key response data: usage must be non-negative');
        }
        if (keyData.limit !== null && typeof keyData.limit !== 'number') {
            throw new Error('Invalid key response data: limit must be a number or null');
        }
        if (typeof keyData.limit === 'number' && keyData.limit < 0) {
            throw new Error('Invalid key response data: limit must be non-negative');
        }
        return {
            limit: keyData.limit,
            usage: keyData.usage,
        };
    }
}
exports.CreditResponse = CreditResponse;
//# sourceMappingURL=CreditResponse.js.map