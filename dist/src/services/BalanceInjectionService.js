"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BalanceInjectionService = void 0;
const KeyResponse_1 = require("../models/KeyResponse");
const OpenRouterRequest_1 = require("../models/OpenRouterRequest");
class BalanceInjectionService {
    constructor(proxyService, openrouterBaseUrl, requestTimeoutMs) {
        this.proxyService = proxyService;
        this.openrouterBaseUrl = openrouterBaseUrl;
        this.requestTimeoutMs = requestTimeoutMs;
    }
    isNewSession(request) {
        if (!Array.isArray(request.messages) || request.messages.length !== 1) {
            return false;
        }
        const firstMessage = request.messages[0];
        return firstMessage !== undefined && firstMessage.role === 'user';
    }
    async getUserBalance(authToken, correlationId) {
        try {
            const openRouterRequest = OpenRouterRequest_1.OpenRouterRequest.fromProxyRequest({
                method: 'GET',
                path: '/api/v1/key',
                headers: { 'Authorization': authToken.token },
                body: {},
                query: {},
            }, this.openrouterBaseUrl, this.requestTimeoutMs).withCorrelationId(correlationId);
            const response = await this.proxyService.makeRequest(openRouterRequest);
            if (response.status === 200 && response.data) {
                const keyResponse = KeyResponse_1.KeyResponse.fromApiResponse(response.data);
                const remainingCredits = keyResponse.getRemainingCredits();
                if (remainingCredits !== null) {
                    return {
                        totalCredits: remainingCredits,
                        usedCredits: keyResponse.usage,
                    };
                }
                return {
                    totalCredits: -1,
                    usedCredits: keyResponse.usage,
                };
            }
            return null;
        }
        catch (error) {
            console.error('Failed to fetch user balance:', error);
            return null;
        }
    }
    createBalanceChunk(chatId, model, balance) {
        const balanceText = balance.totalCredits === -1
            ? `💰 Account: Unlimited credits (${balance.usedCredits} used)`
            : `💰 Balance: ${balance.totalCredits} credits remaining (${balance.usedCredits} used)`;
        return {
            id: chatId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: model || 'unknown',
            choices: [
                {
                    index: 0,
                    delta: {
                        role: 'assistant',
                        content: balanceText,
                    },
                    finish_reason: null,
                },
            ],
        };
    }
    createCompletionChunk(chatId, model) {
        return {
            id: chatId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: model || 'unknown',
            choices: [
                {
                    index: 0,
                    delta: {},
                    finish_reason: 'stop',
                },
            ],
        };
    }
    formatAsSSE(chunk) {
        return `data: ${JSON.stringify(chunk)}\n\n`;
    }
    generateChatId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        return `chatcmpl-${timestamp}${random}`;
    }
}
exports.BalanceInjectionService = BalanceInjectionService;
//# sourceMappingURL=BalanceInjectionService.js.map