/**
 * Model Data Service - Fetches and caches model metadata from OpenRouter
 */

import axios from 'axios';
import { Logger } from '../utils/logger';
import { envConfig } from '../config/environment';

export interface ModelLimitsData {
  maxContextTokens: number;
  maxPromptTokens: number;
}

interface OpenRouterModel {
  id: string;
  context_length: number | null;
  per_request_limits?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

export class ModelDataService {
  private modelCache: Map<string, ModelLimitsData> = new Map();
  private initialized = false;
  private lastFetchTime: number | null = null;

  /**
   * Fetch all models from OpenRouter API and cache their limits
   * @returns true if successful, false if failed
   */
  async fetchModels(): Promise<boolean> {
    try {
      // Check if API key is available
      if (!envConfig.OPENROUTER_API_KEY) {
        Logger.warn(
          'OPENROUTER_API_KEY not set - skipping model data fetch. Will use fallback limits.',
          'startup'
        );
        return false;
      }

      Logger.info('Fetching model data from OpenRouter API', 'startup');

      const response = await axios.get<OpenRouterModelsResponse>(
        'https://openrouter.ai/api/v1/models',
        {
          headers: {
            Authorization: `Bearer ${envConfig.OPENROUTER_API_KEY}`,
          },
          timeout: 10000, // 10 second timeout
        }
      );

      // Clear existing cache
      this.modelCache.clear();

      // Process each model
      for (const model of response.data.data) {
        const maxContextTokens =
          model.context_length ??
          model.per_request_limits?.prompt_tokens ??
          32000; // Safe fallback

        const maxPromptTokens =
          model.per_request_limits?.prompt_tokens ??
          model.context_length ??
          32000; // Safe fallback

        this.modelCache.set(model.id, {
          maxContextTokens,
          maxPromptTokens,
        });
      }

      this.initialized = true;
      this.lastFetchTime = Date.now();

      Logger.info('Model data fetched successfully', 'startup', {
        modelCount: this.modelCache.size,
      });

      return true;
    } catch (error) {
      Logger.error('Failed to fetch model data from OpenRouter', 'startup', {
        error: error instanceof Error ? error.message : String(error),
      });

      this.initialized = false;
      return false;
    }
  }

  /**
   * Get model limits for a specific model ID
   * @param modelId - The model identifier (e.g., "anthropic/claude-3.5-sonnet")
   * @returns Model limits or null if not found
   */
  getModelLimits(modelId: string): ModelLimitsData | null {
    return this.modelCache.get(modelId) ?? null;
  }

  /**
   * Check if the service has been initialized with model data
   * @returns true if initialized, false otherwise
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the number of models in the cache
   * @returns Number of cached models
   */
  getModelCount(): number {
    return this.modelCache.size;
  }

  /**
   * Get the timestamp of the last successful fetch
   * @returns Timestamp in milliseconds, or null if never fetched
   */
  getLastFetchTime(): number | null {
    return this.lastFetchTime;
  }
}
