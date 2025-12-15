/**
 * Context window warning generation and formatting
 */

import type { WarningLevel } from '../config/model-limits';

/**
 * Format a number with k/M suffix for better readability
 * @param num - The number to format
 * @returns Formatted string with k or M suffix
 */
function formatTokenCount(num: number): string {
  if (num >= 1000000) {
    return `${Math.round(num / 1000)}k`; // Still use k for consistency
  }
  if (num >= 1000) {
    return `${Math.round(num / 1000)}k`;
  }
  return num.toString();
}

/**
 * Generate a context warning message based on usage level
 * @param level - Warning level ('none', 'info', 'warning', 'critical')
 * @param promptTokens - Number of tokens used in the prompt
 * @param maxTokens - Maximum context tokens for the model
 * @returns Warning message string, or null if level is 'none'
 */
export function generateContextWarning(
  level: WarningLevel,
  promptTokens: number,
  maxTokens: number
): string | null {
  if (level === 'none') {
    return null;
  }

  const percentage = Math.round((promptTokens / maxTokens) * 100);
  const promptFormatted = formatTokenCount(promptTokens);
  const maxFormatted = formatTokenCount(maxTokens);

  const messages = {
    info: `📊 Context Window: ${percentage}% used (${promptFormatted}/${maxFormatted} tokens). Your conversation is getting long.`,
    warning: `⚠️ Context Window: ${percentage}% used (${promptFormatted}/${maxFormatted} tokens). Consider summarizing or starting a new chat for better response quality.`,
    critical: `🚨 Context Window: ${percentage}% used (${promptFormatted}/${maxFormatted} tokens). Approaching limit - response quality may degrade. Start a new chat soon.`,
  };

  return messages[level];
}

/**
 * Create an SSE (Server-Sent Events) data chunk with warning content
 * @param warningText - The warning message to inject
 * @returns Formatted SSE chunk as a string
 */
export function createWarningSSEChunk(warningText: string): string {
  const sseData = {
    choices: [
      {
        index: 0,
        delta: {
          content: `\n\n${warningText}`,
        },
      },
    ],
  };

  return `data: ${JSON.stringify(sseData)}\n\n`;
}
