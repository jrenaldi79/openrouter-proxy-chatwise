/**
 * Model token limits and context window management
 * Now uses dynamic limits from OpenRouter API with static fallback
 */

import { modelDataService } from './services';

export type Provider = 'anthropic' | 'openai' | 'gemini' | 'grok' | 'unknown';
export type WarningLevel = 'none' | 'info' | 'warning' | 'critical';

export interface ModelLimits {
  maxContextTokens: number;
  provider: Provider;
}

/**
 * Model detection patterns by provider
 */
const MODEL_PATTERNS = {
  anthropic: /^(anthropic\/|claude)/i,
  openai: /^(openai\/|gpt-)/i,
  gemini: /^(google\/|gemini)/i,
  grok: /^(x-ai\/|grok)/i,
};

/**
 * Token limits by provider
 * Conservative limits per user requirements - Anthropic capped at 400k despite 1M marketing claim
 */
const PROVIDER_LIMITS: Record<Provider, number> = {
  anthropic: 400000, // Conservative limit vs 1M marketing claim
  openai: 128000, // Default for gpt-4o, gpt-4-turbo
  gemini: 1000000, // Gemini 1.5/2.0
  grok: 128000, // Grok 2
  unknown: 32000, // Safe default for unknown models
};

/**
 * Model-specific overrides for providers with varying limits
 * Use exact matching to avoid false positives (e.g., gpt-4 vs gpt-4o)
 */
const MODEL_SPECIFIC_LIMITS: Record<string, number> = {
  'gpt-4': 32000, // Legacy GPT-4 (not gpt-4o, gpt-4-turbo)
  'gpt-3.5': 32000, // GPT-3.5 family
};

/**
 * Warning thresholds as percentage of max context
 */
const WARNING_THRESHOLDS = {
  INFO: 25, // 25% usage
  WARNING: 40, // 40% usage
  CRITICAL: 50, // 50% usage (absolute max per user requirement)
};

/**
 * Get model limits for a given model name
 * Tries dynamic lookup from OpenRouter API first, then falls back to static limits
 * @param model - Model name from OpenRouter (e.g., "claude-3-5-sonnet", "gpt-4o")
 * @returns Model limits including provider and max context tokens
 */
export function getModelLimits(model: string): ModelLimits {
  // Try dynamic lookup first (if model data service is initialized)
  if (modelDataService.isInitialized()) {
    const dynamicLimits = modelDataService.getModelLimits(model);
    if (dynamicLimits) {
      // Determine provider from model name
      let provider: Provider = 'unknown';
      for (const [providerName, pattern] of Object.entries(MODEL_PATTERNS)) {
        if (pattern.test(model)) {
          provider = providerName as Provider;
          break;
        }
      }

      return {
        provider,
        maxContextTokens: dynamicLimits.maxPromptTokens, // Use prompt token limit
      };
    }
  }

  // Fall back to static limits
  return getStaticModelLimits(model);
}

/**
 * Get static/fallback model limits (legacy hard-coded approach)
 * Used when dynamic lookup is unavailable or fails
 * @param model - Model name from OpenRouter
 * @returns Model limits from hard-coded data
 */
function getStaticModelLimits(model: string): ModelLimits {
  // Normalize model name for pattern matching (remove provider prefix)
  const normalizedModel = model.toLowerCase().replace(/^(openai\/|anthropic\/|google\/|x-ai\/)/, '');

  // Check for model-specific overrides first
  // Use startsWith for exact model family matching (avoids gpt-4 matching gpt-4o)
  for (const [modelPrefix, limit] of Object.entries(MODEL_SPECIFIC_LIMITS)) {
    // Exact match: gpt-4 should only match "gpt-4" and "gpt-4-<date>", not "gpt-4o" or "gpt-4-turbo"
    if (normalizedModel === modelPrefix || normalizedModel.startsWith(modelPrefix + '-')) {
      // Exclude newer variants
      if (modelPrefix === 'gpt-4' && (normalizedModel.includes('turbo') || normalizedModel.includes('gpt-4o'))) {
        continue; // Skip this rule, use provider default
      }

      // Determine provider
      let provider: Provider = 'unknown';
      for (const [providerName, pattern] of Object.entries(MODEL_PATTERNS)) {
        if (pattern.test(model)) {
          provider = providerName as Provider;
          break;
        }
      }
      return {
        provider,
        maxContextTokens: limit,
      };
    }
  }

  // Check provider patterns
  for (const [providerName, pattern] of Object.entries(MODEL_PATTERNS)) {
    if (pattern.test(model)) {
      return {
        provider: providerName as Provider,
        maxContextTokens: PROVIDER_LIMITS[providerName as Provider],
      };
    }
  }

  // Unknown model - use safe default
  return {
    provider: 'unknown',
    maxContextTokens: PROVIDER_LIMITS.unknown,
  };
}

/**
 * Calculate the percentage of context window used
 * @param promptTokens - Number of tokens in the prompt
 * @param limits - Model limits
 * @returns Percentage used, rounded to 2 decimal places
 */
export function getWarningPercentage(
  promptTokens: number,
  limits: ModelLimits
): number {
  const percentage = (promptTokens / limits.maxContextTokens) * 100;
  return Math.round(percentage * 100) / 100; // Round to 2 decimal places
}

/**
 * Get warning level based on token usage
 * @param promptTokens - Number of tokens in the prompt
 * @param limits - Model limits
 * @returns Warning level ('none', 'info', 'warning', 'critical')
 */
export function getWarningLevel(
  promptTokens: number,
  limits: ModelLimits
): WarningLevel {
  // Use raw percentage for threshold comparison to avoid rounding issues
  const rawPercentage = (promptTokens / limits.maxContextTokens) * 100;

  if (rawPercentage >= WARNING_THRESHOLDS.CRITICAL) {
    return 'critical';
  }
  if (rawPercentage >= WARNING_THRESHOLDS.WARNING) {
    return 'warning';
  }
  if (rawPercentage >= WARNING_THRESHOLDS.INFO) {
    return 'info';
  }
  return 'none';
}
