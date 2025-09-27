"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxyRequest = void 0;
const uuid_1 = require("uuid");
class ProxyRequest {
    constructor(data) {
        this.method = data.method.toUpperCase();
        this.path = data.path;
        this.headers = { ...data.headers };
        this.query = { ...data.query };
        this.body = data.body;
        this.correlationId = data.correlationId || (0, uuid_1.v4)();
        this.validate();
    }
    validate() {
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
        if (!this.path.startsWith('/api/v1/')) {
            throw new Error(`Invalid API path: ${this.path}`);
        }
        const authHeader = this.getAuthorizationHeader();
        if (authHeader && !this.isValidApiKeyFormat(authHeader)) {
            throw new Error('Invalid API key format');
        }
        this.validateHeaderSecurity();
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
    isValidApiKeyFormat(authHeader) {
        if (!authHeader.startsWith('Bearer ')) {
            return false;
        }
        const apiKey = authHeader.substring(7);
        return /^sk-or-v1-.+/.test(apiKey);
    }
    isCreditEndpoint() {
        return this.method === 'GET' && this.path === '/api/v1/me/credits';
    }
    isHealthEndpoint() {
        return this.method === 'GET' && this.path === '/health';
    }
    validateHeaderSecurity() {
        const suspiciousPatterns = [
            /<script.*?>.*?<\/script>/i,
            /javascript:/i,
            /vbscript:/i,
            /on\w+=/i,
            /\$\(.*\)/,
            /DROP\s+TABLE/i,
            /SELECT.*FROM/i,
            /\.\.\//,
        ];
        Object.entries(this.headers).forEach(([key, value]) => {
            if (key.toLowerCase() === 'authorization') {
                return;
            }
            suspiciousPatterns.forEach(pattern => {
                if (pattern.test(value)) {
                    throw new Error(`Suspicious content detected in header ${key}`);
                }
            });
        });
    }
    getQueryParameter(key) {
        return this.query[key];
    }
    hasQueryParameter(key) {
        return key in this.query;
    }
    getContentType() {
        return this.headers['content-type'] || this.headers['Content-Type'];
    }
    isJsonContent() {
        const contentType = this.getContentType();
        return contentType?.includes('application/json') || false;
    }
    getContentLength() {
        const lengthHeader = this.headers['content-length'] || this.headers['Content-Length'];
        return lengthHeader ? parseInt(lengthHeader, 10) : undefined;
    }
    toJSON() {
        return {
            method: this.method,
            path: this.path,
            headers: this.headers,
            query: this.query,
            body: this.body,
            correlationId: this.correlationId,
        };
    }
    static fromExpressRequest(req) {
        return new ProxyRequest({
            method: req.method,
            path: req.path,
            headers: req.headers,
            query: req.query,
            body: req.body,
            correlationId: req.correlationId,
        });
    }
}
exports.ProxyRequest = ProxyRequest;
//# sourceMappingURL=ProxyRequest.js.map