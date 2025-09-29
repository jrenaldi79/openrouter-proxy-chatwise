"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxyService = void 0;
const axios_1 = __importDefault(require("axios"));
const https_1 = __importDefault(require("https"));
const OpenRouterRequest_1 = require("../models/OpenRouterRequest");
class ProxyService {
    constructor(baseUrl = 'https://openrouter.ai', _defaultTimeout = 30000) {
        this.baseUrl = baseUrl;
        this.httpsAgent = new https_1.default.Agent({
            keepAlive: true,
            timeout: 60000,
            rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
        });
    }
    async makeRequest(request) {
        let lastError = null;
        for (let attempt = 0; attempt <= request.retryConfig.maxRetries; attempt++) {
            try {
                const response = await this.executeRequest(request);
                return this.formatResponse(response);
            }
            catch (error) {
                lastError = error;
                if (attempt < request.retryConfig.maxRetries &&
                    this.shouldRetry(error, request)) {
                    const delay = request.calculateRetryDelay(attempt);
                    if (delay > 0) {
                        await this.sleep(delay);
                    }
                    continue;
                }
                break;
            }
        }
        throw this.formatError(lastError);
    }
    async executeRequest(request) {
        if (process.env.NODE_ENV === 'production') {
            try {
                const response = await this.executeFetchRequest(request);
                return response;
            }
            catch (fetchError) {
                console.warn('Fetch failed, falling back to axios:', fetchError);
            }
        }
        const config = {
            method: request.method.toLowerCase(),
            url: request.url,
            headers: request.headers,
            timeout: request.timeout,
            data: request.body,
            validateStatus: () => true,
            httpsAgent: this.httpsAgent,
        };
        return await (0, axios_1.default)(config);
    }
    async executeFetchRequest(request) {
        const fetchOptions = {
            method: request.method,
            headers: request.headers,
            body: request.body && request.method !== 'GET'
                ? JSON.stringify(request.body)
                : undefined,
        };
        const response = await fetch(request.url, fetchOptions);
        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        }
        else {
            data = await response.text();
        }
        const headers = {};
        response.headers.forEach((value, key) => {
            headers[key] = value;
        });
        return {
            status: response.status,
            statusText: response.statusText,
            headers,
            data,
            config: {},
            request: {},
        };
    }
    formatResponse(response) {
        return {
            status: response.status,
            headers: response.headers,
            data: response.data,
        };
    }
    shouldRetry(error, request) {
        if (axios_1.default.isAxiosError(error)) {
            const axiosError = error;
            if (axiosError.code === 'ECONNABORTED' &&
                axiosError.message.includes('timeout')) {
                return true;
            }
            if (!axiosError.response) {
                return request.shouldRetry(0, error);
            }
            if (axiosError.response.status &&
                request.shouldRetryHttpStatus(axiosError.response.status)) {
                return true;
            }
        }
        return request.shouldRetry(0, error);
    }
    formatError(error) {
        if (axios_1.default.isAxiosError(error)) {
            const axiosError = error;
            if (axiosError.code === 'ECONNABORTED' &&
                axiosError.message.includes('timeout')) {
                return new Error('Request timeout');
            }
            if (!axiosError.response) {
                return new Error(`Network error: ${axiosError.message}`);
            }
            return new Error(`HTTP ${axiosError.response.status}: ${axiosError.response.statusText}`);
        }
        return error;
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async checkConnectivity() {
        try {
            const healthRequest = new OpenRouterRequest_1.OpenRouterRequest({
                url: `${this.baseUrl}/health`,
                method: 'GET',
                headers: {},
                timeout: 5000,
            });
            await this.makeRequest(healthRequest);
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.ProxyService = ProxyService;
//# sourceMappingURL=ProxyService.js.map