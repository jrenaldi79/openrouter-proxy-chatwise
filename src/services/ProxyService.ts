import axios, { AxiosResponse, AxiosError } from 'axios';
import https from 'https';
import { OpenRouterRequest } from '../models/OpenRouterRequest';

export interface ProxyResponse {
  status: number;
  headers: Record<string, string>;
  data: unknown;
}

export class ProxyService {
  private readonly baseUrl: string;
  private readonly httpsAgent: https.Agent;

  constructor(
    baseUrl: string = 'https://openrouter.ai',
    _defaultTimeout: number = 30000
  ) {
    this.baseUrl = baseUrl;

    // Create HTTPS agent optimized for Cloud Run environment
    this.httpsAgent = new https.Agent({
      keepAlive: true,
      timeout: 60000,
      // In production environments like Cloud Run, certificate verification
      // can sometimes fail due to corporate firewalls or proxy configurations
      rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
    });
  }

  public async makeRequest(request: OpenRouterRequest): Promise<ProxyResponse> {
    let lastError: Error | null = null;

    for (
      let attempt = 0;
      attempt <= request.retryConfig.maxRetries;
      attempt++
    ) {
      try {
        const response = await this.executeRequest(request);
        return this.formatResponse(response);
      } catch (error) {
        lastError = error as Error;

        // Check if we should retry
        if (
          attempt < request.retryConfig.maxRetries &&
          this.shouldRetry(error as Error, request)
        ) {
          const delay = request.calculateRetryDelay(attempt);
          if (delay > 0) {
            await this.sleep(delay);
          }
          continue;
        }

        // No more retries or not a retryable error
        break;
      }
    }

    // All retries failed, throw the last error
    throw this.formatError(lastError!);
  }

  private async executeRequest(
    request: OpenRouterRequest
  ): Promise<AxiosResponse> {
    // Try fetch API first in production for better SSL compatibility
    if (process.env.NODE_ENV === 'production') {
      try {
        const response = await this.executeFetchRequest(request);
        return response;
      } catch (fetchError) {
        // Fallback to axios if fetch fails
        console.warn('Fetch failed, falling back to axios:', fetchError);
      }
    }

    const config = {
      method: request.method.toLowerCase() as
        | 'get'
        | 'post'
        | 'put'
        | 'delete'
        | 'patch',
      url: request.url,
      headers: request.headers,
      timeout: request.timeout,
      data: request.body,
      validateStatus: () => true, // Don't throw on HTTP error status codes
      httpsAgent: this.httpsAgent, // Use our configured HTTPS agent
    };

    return await axios(config);
  }

  private async executeFetchRequest(
    request: OpenRouterRequest
  ): Promise<AxiosResponse> {
    const fetchOptions: RequestInit = {
      method: request.method,
      headers: request.headers,
      body:
        request.body && request.method !== 'GET'
          ? JSON.stringify(request.body)
          : undefined,
    };

    const response = await fetch(request.url, fetchOptions);

    // Convert fetch response to axios-like response
    let data: unknown;
    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    // Convert Headers to plain object
    const headers: Record<string, string> = {};
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
    } as AxiosResponse;
  }

  private formatResponse(response: AxiosResponse): ProxyResponse {
    return {
      status: response.status,
      headers: response.headers as Record<string, string>,
      data: response.data,
    };
  }

  private shouldRetry(error: Error, request: OpenRouterRequest): boolean {
    // Check if it's an Axios error with response
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      // Retry on timeout
      if (
        axiosError.code === 'ECONNABORTED' &&
        axiosError.message.includes('timeout')
      ) {
        return true;
      }

      // Retry on network errors
      if (!axiosError.response) {
        return request.shouldRetry(0, error);
      }

      // Retry on specific HTTP status codes
      if (
        axiosError.response.status &&
        request.shouldRetryHttpStatus(axiosError.response.status)
      ) {
        return true;
      }
    }

    return request.shouldRetry(0, error);
  }

  private formatError(error: Error): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      if (
        axiosError.code === 'ECONNABORTED' &&
        axiosError.message.includes('timeout')
      ) {
        return new Error('Request timeout');
      }

      if (!axiosError.response) {
        return new Error(`Network error: ${axiosError.message}`);
      }

      return new Error(
        `HTTP ${axiosError.response.status}: ${axiosError.response.statusText}`
      );
    }

    return error;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public async checkConnectivity(): Promise<boolean> {
    try {
      const healthRequest = new OpenRouterRequest({
        url: `${this.baseUrl}/health`,
        method: 'GET',
        headers: {},
        timeout: 5000, // Short timeout for health check
      });

      await this.makeRequest(healthRequest);
      return true;
    } catch {
      return false;
    }
  }
}
