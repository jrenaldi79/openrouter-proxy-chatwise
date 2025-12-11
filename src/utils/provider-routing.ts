/**
 * Provider routing utilities for OpenRouter requests
 *
 * Forces Claude/Anthropic models to route directly to Anthropic
 * instead of through Google Vertex AI or other providers.
 *
 * This fixes intermittent reasoning truncation issues observed
 * when OpenRouter routes Claude models through Google Vertex AI.
 */

import { Logger } from './logger';

/**
 * Check if a model is a Claude/Anthropic model that should be routed directly to Anthropic
 */
export function isAnthropicModel(model: string | undefined): boolean {
  if (!model) return false;

  const lowerModel = model.toLowerCase();
  return lowerModel.startsWith('anthropic/') || lowerModel.includes('claude');
}

/**
 * Provider routing configuration to force Anthropic direct routing
 */
export const ANTHROPIC_PROVIDER_CONFIG = {
  order: ['Anthropic'],
  allow_fallbacks: false,
};

/**
 * Inject Anthropic provider routing into a request body if applicable
 *
 * @param body - The original request body
 * @param correlationId - Request correlation ID for logging
 * @returns Modified body with provider routing, or original body if not applicable
 */
export function injectAnthropicProvider<
  T extends { model?: string; provider?: unknown },
>(body: T, correlationId?: string): T {
  // Skip if no model specified
  if (!body?.model) {
    return body;
  }

  // Skip if not an Anthropic model
  if (!isAnthropicModel(body.model)) {
    return body;
  }

  // Skip if provider is already explicitly set
  if (body.provider) {
    Logger.debug('Provider already set, skipping injection', correlationId, {
      model: body.model,
      existingProvider: body.provider,
    });
    return body;
  }

  // Inject Anthropic provider routing
  Logger.info(
    'Injecting Anthropic provider routing for Claude model',
    correlationId,
    { model: body.model }
  );

  return {
    ...body,
    provider: ANTHROPIC_PROVIDER_CONFIG,
  };
}
