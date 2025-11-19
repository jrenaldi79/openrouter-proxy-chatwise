import {
  BalanceInjectionService,
  ChatMessage,
} from '../../src/services/BalanceInjectionService';
import { ProxyService } from '../../src/services/ProxyService';
import { AuthToken } from '../../src/models/AuthToken';
import { ProxyResponse } from '../../src/services/ProxyService';

// Mock ProxyService
jest.mock('../../src/services/ProxyService');

describe('BalanceInjectionService', () => {
  let balanceInjectionService: BalanceInjectionService;
  let mockProxyService: jest.Mocked<ProxyService>;

  beforeEach(() => {
    // Manually create a mock instance of ProxyService
    mockProxyService = new (ProxyService as jest.Mock<ProxyService>)(
      {} as any,
      1000,
      'dummy-api-key',
      'dummy-base-url'
    ) as jest.Mocked<ProxyService>;
    balanceInjectionService = new BalanceInjectionService(
      mockProxyService,
      'https://openrouter.ai/api',
      5000
    );
  });

  describe('isChatWiseClient', () => {
    it('should return true for ChatWise user-agent', () => {
      const headers = { 'user-agent': 'ChatWise/1.0' };
      expect(balanceInjectionService.isChatWiseClient(headers)).toBe(true);
    });

    it('should return false for other user-agents', () => {
      const headers = { 'user-agent': 'Mozilla/5.0' };
      expect(balanceInjectionService.isChatWiseClient(headers)).toBe(false);
    });
  });

  describe('isNewSession', () => {
    it('should return true for a single user message', () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' } as ChatMessage],
      };
      expect(balanceInjectionService.isNewSession(request)).toBe(true);
    });

    it('should return false for an ongoing conversation', () => {
      const request = {
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'How are you?' },
        ] as ChatMessage[],
      };
      expect(balanceInjectionService.isNewSession(request)).toBe(false);
    });
  });

  describe('getUserBalance', () => {
    it('should return the user balance on successful API call', async () => {
      const authToken = new AuthToken('test-token');
      const correlationId = 'test-id';
      const mockApiResponse: ProxyResponse = {
        status: 200,
        headers: {},
        data: {
          data: {
            usage: 10,
            limit: 100,
            // ... other properties
          },
        },
      };

      // Mock the makeRequest method to return a successful response
      mockProxyService.makeRequest.mockResolvedValue(mockApiResponse);

      const balance = await balanceInjectionService.getUserBalance(
        authToken,
        correlationId
      );

      expect(balance).toEqual({
        totalCredits: 90,
        usedCredits: 10,
      });
    });

    it('should return null on API error', async () => {
      const authToken = new AuthToken('test-token');
      const correlationId = 'test-id';

      // Mock the makeRequest method to throw an error
      mockProxyService.makeRequest.mockRejectedValue(new Error('API Error'));

      const balance = await balanceInjectionService.getUserBalance(
        authToken,
        correlationId
      );

      expect(balance).toBeNull();
    });
  });

  describe('createBalanceChunk', () => {
    it('should create a balance chunk for a limited account', () => {
      const chatId = 'chat-123';
      const model = 'gpt-3.5-turbo';
      const balance = { totalCredits: 90, usedCredits: 10 };

      const chunk = balanceInjectionService.createBalanceChunk(
        chatId,
        model,
        balance
      );

      expect(chunk.id).toBe(chatId);
      expect(chunk.model).toBe(model);
      expect(chunk.choices[0]?.delta.content).toContain('$90.00 remaining');
    });

    it('should create a balance chunk for an unlimited account', () => {
      const chatId = 'chat-123';
      const model = 'gpt-3.5-turbo';
      const balance = { totalCredits: -1, usedCredits: 10 };

      const chunk = balanceInjectionService.createBalanceChunk(
        chatId,
        model,
        balance
      );

      expect(chunk.choices[0]?.delta.content).toContain('Unlimited credits');
    });
  });

  describe('formatAsSSE', () => {
    it('should format a chunk as a Server-Sent Event', () => {
      const chunk = {
        id: 'chat-123',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-3.5-turbo',
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
              content: 'Hello',
            },
            finish_reason: null,
          },
        ],
      };

      const sse = balanceInjectionService.formatAsSSE(chunk as any);
      expect(sse).toBe(`data: ${JSON.stringify(chunk)}

`);
    });
  });
});
