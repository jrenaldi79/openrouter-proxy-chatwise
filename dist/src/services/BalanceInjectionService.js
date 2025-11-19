"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BalanceInjectionService = void 0;
const KeyResponse_1 = require("../models/KeyResponse");
const OpenRouterRequest_1 = require("../models/OpenRouterRequest");
const logger_1 = require("../utils/logger");
const weave_1 = require("../config/weave");
class BalanceInjectionService {
    constructor(proxyService, openrouterBaseUrl, requestTimeoutMs) {
        this.proxyService = proxyService;
        this.openrouterBaseUrl = openrouterBaseUrl;
        this.requestTimeoutMs = requestTimeoutMs;
        this.weaveOp = (0, weave_1.getWeaveOp)();
        this.getUserBalance = this.weaveOp(this.getUserBalance.bind(this), {
            name: 'BalanceInjectionService.getUserBalance',
        });
    }
    isChatWiseClient(headers) {
        const userAgent = String(headers['user-agent'] || '').toLowerCase();
        const origin = String(headers['origin'] || '');
        const referer = String(headers['referer'] || '').toLowerCase();
        const httpReferer = String(headers['http-referer'] || '').toLowerCase();
        const hasExplicitChatWise = userAgent.includes('chatwise') ||
            origin.includes('chatwise') ||
            referer.includes('chatwise') ||
            httpReferer.includes('chatwise') ||
            userAgent.includes('electron') ||
            userAgent.includes('ai-sdk/openrouter');
        const isDesktopApp = !origin &&
            !referer &&
            !httpReferer &&
            (userAgent.includes('chrome') || userAgent.includes('webkit')) &&
            userAgent.includes('macintosh');
        return hasExplicitChatWise || isDesktopApp;
    }
    isNewSession(request) {
        if (!Array.isArray(request.messages)) {
            return false;
        }
        if (request.messages.length === 1) {
            const firstMessage = request.messages[0];
            return firstMessage !== undefined && firstMessage.role === 'user';
        }
        if (request.messages.length === 2) {
            const [systemMessage, userMessage] = request.messages;
            return systemMessage?.role === 'system' && userMessage?.role === 'user';
        }
        return false;
    }
    async getUserBalance(authToken, correlationId) {
        try {
            logger_1.Logger.balanceDebug('Fetching balance for token', correlationId, {
                tokenPrefix: authToken.token.substring(0, 20),
            });
            const openRouterRequest = OpenRouterRequest_1.OpenRouterRequest.fromProxyRequest({
                method: 'GET',
                path: '/api/v1/key',
                headers: { Authorization: authToken.getAuthorizationHeader() },
                body: {},
                query: {},
            }, this.openrouterBaseUrl, this.requestTimeoutMs).withCorrelationId(correlationId);
            logger_1.Logger.balanceDebug('Making request to OpenRouter API', correlationId, {
                url: openRouterRequest.url,
                headers: openRouterRequest.headers,
            });
            const response = await this.proxyService.makeRequest(openRouterRequest);
            logger_1.Logger.balanceDebug('Balance API response received', correlationId, {
                status: response.status,
                data: response.data,
            });
            if (response.status === 200 && response.data) {
                const apiData = response.data;
                if (apiData.data) {
                    const keyResponse = KeyResponse_1.KeyResponse.fromApiResponse(apiData.data);
                    const remainingCredits = keyResponse.getRemainingCredits();
                    logger_1.Logger.balanceDebug('Balance parsing successful', correlationId, {
                        remainingCredits,
                        usage: keyResponse.usage,
                    });
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
            }
            logger_1.Logger.balanceError('Balance fetch failed - invalid response', correlationId);
            return null;
        }
        catch (error) {
            logger_1.Logger.balanceError('Failed to fetch user balance', correlationId, error instanceof Error ? error : new Error(String(error)));
            return null;
        }
    }
    creditsToDollars(credits) {
        return credits.toFixed(2);
    }
    createBalanceChunk(chatId, model, balance) {
        const usedDollars = this.creditsToDollars(balance.usedCredits);
        const balanceText = balance.totalCredits === -1
            ? `💰 Account: Unlimited credits ($${usedDollars} used)`
            : `💰 Balance: $${this.creditsToDollars(balance.totalCredits)} remaining ($${usedDollars} used)`;
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