import { AuthToken } from '../models/AuthToken';
import { KeyResponse } from '../models/KeyResponse';
import { ProxyService } from './ProxyService';
import { OpenRouterRequest } from '../models/OpenRouterRequest';
import { Logger } from '../utils/logger';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  model?: string;
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  [key: string]: unknown;
}

export interface StreamingChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }>;
}

export class BalanceInjectionService {
  private proxyService: ProxyService;
  private openrouterBaseUrl: string;
  private requestTimeoutMs: number;

  constructor(
    proxyService: ProxyService,
    openrouterBaseUrl: string,
    requestTimeoutMs: number
  ) {
    this.proxyService = proxyService;
    this.openrouterBaseUrl = openrouterBaseUrl;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  /**
   * Detects if the request is from ChatWise client
   */
  public isChatWiseClient(
    headers: Record<string, string | string[] | undefined>
  ): boolean {
    const userAgent = String(headers['user-agent'] || '').toLowerCase();
    const origin = String(headers['origin'] || '');
    const referer = String(headers['referer'] || '');

    // Check for explicit ChatWise indicators
    const hasExplicitChatWise =
      userAgent.includes('chatwise') ||
      origin.includes('chatwise') ||
      referer.includes('chatwise') ||
      userAgent.includes('electron');

    // Check for desktop app patterns (empty origin/referer with standard browser user-agent)
    const isDesktopApp =
      !origin &&
      !referer &&
      (userAgent.includes('chrome') || userAgent.includes('webkit')) &&
      userAgent.includes('macintosh');

    return hasExplicitChatWise || isDesktopApp;
  }

  /**
   * Checks if this is a new chat session
   * Detects: single user message OR system + single user message
   */
  public isNewSession(request: ChatCompletionRequest): boolean {
    if (!Array.isArray(request.messages)) {
      return false;
    }

    // Case 1: Single user message
    if (request.messages.length === 1) {
      const firstMessage = request.messages[0];
      return firstMessage !== undefined && firstMessage.role === 'user';
    }

    // Case 2: System message + single user message (ChatWise pattern)
    if (request.messages.length === 2) {
      const [systemMessage, userMessage] = request.messages;
      return systemMessage?.role === 'system' && userMessage?.role === 'user';
    }

    return false;
  }

  /**
   * Retrieves user's balance from OpenRouter
   */
  public async getUserBalance(
    authToken: AuthToken,
    correlationId: string
  ): Promise<{ totalCredits: number; usedCredits: number } | null> {
    try {
      Logger.balanceDebug('Fetching balance for token', correlationId, {
        tokenPrefix: authToken.token.substring(0, 20),
      });

      // Create request to OpenRouter's key endpoint (same as credit transformation)
      const openRouterRequest = OpenRouterRequest.fromProxyRequest(
        {
          method: 'GET',
          path: '/api/v1/key',
          headers: { Authorization: authToken.getAuthorizationHeader() },
          body: {},
          query: {},
        },
        this.openrouterBaseUrl,
        this.requestTimeoutMs
      ).withCorrelationId(correlationId);

      Logger.balanceDebug('Making request to OpenRouter API', correlationId, {
        url: openRouterRequest.url,
        headers: openRouterRequest.headers,
      });

      const response = await this.proxyService.makeRequest(openRouterRequest);

      Logger.balanceDebug('Balance API response received', correlationId, {
        status: response.status,
        data: response.data,
      });

      if (response.status === 200 && response.data) {
        // OpenRouter API returns { data: { ... } } structure
        const apiData = response.data as { data?: unknown };
        if (apiData.data) {
          const keyResponse = KeyResponse.fromApiResponse(apiData.data);
          const remainingCredits = keyResponse.getRemainingCredits();

          Logger.balanceDebug('Balance parsing successful', correlationId, {
            remainingCredits,
            usage: keyResponse.usage,
          });

          if (remainingCredits !== null) {
            return {
              totalCredits: remainingCredits,
              usedCredits: keyResponse.usage,
            };
          }

          // Handle unlimited accounts
          return {
            totalCredits: -1, // Indicates unlimited
            usedCredits: keyResponse.usage,
          };
        }
      }

      Logger.balanceError(
        'Balance fetch failed - invalid response',
        correlationId
      );
      return null;
    } catch (error) {
      Logger.balanceError(
        'Failed to fetch user balance',
        correlationId,
        error instanceof Error ? error : new Error(String(error))
      );
      return null;
    }
  }

  /**
   * Converts credits to dollars (1 credit = $1 USD)
   */
  private creditsToDollars(credits: number): string {
    return credits.toFixed(2);
  }

  /**
   * Creates a balance message chunk for streaming
   */
  public createBalanceChunk(
    chatId: string,
    model: string,
    balance: { totalCredits: number; usedCredits: number }
  ): StreamingChunk {
    const usedDollars = this.creditsToDollars(balance.usedCredits);

    const balanceText =
      balance.totalCredits === -1
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

  /**
   * Creates a completion chunk for streaming (to close the balance message)
   */
  public createCompletionChunk(chatId: string, model: string): StreamingChunk {
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

  /**
   * Formats a chunk as Server-Sent Event data
   */
  public formatAsSSE(chunk: StreamingChunk): string {
    return `data: ${JSON.stringify(chunk)}\n\n`;
  }

  /**
   * Generates a unique chat completion ID
   */
  public generateChatId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `chatcmpl-${timestamp}${random}`;
  }
}
