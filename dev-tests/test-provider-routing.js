/**
 * Test script to compare Google Vertex vs Anthropic direct provider routing
 *
 * Tests if forcing Anthropic provider fixes the reasoning cutoff issue
 */

const API_KEY = process.env.OPENROUTER_TEST_API_KEY;

if (!API_KEY) {
  console.error('ERROR: Set OPENROUTER_TEST_API_KEY environment variable');
  process.exit(1);
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function testProvider(providerConfig, label) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${label}`);
  console.log('='.repeat(60));

  const requestBody = {
    model: 'anthropic/claude-sonnet-4.5',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'What is 15 * 23? Think carefully about this.' }
    ],
    stream: true,
    max_tokens: 16000,
    // Enable extended thinking/reasoning
    reasoning: {
      max_tokens: 8000
    },
    ...providerConfig
  };

  console.log('Request config:', JSON.stringify(providerConfig || 'default', null, 2));

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://test.example.com',
        'X-Title': 'Provider Routing Test'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`HTTP Error ${response.status}:`, errorText);
      return null;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let fullContent = '';
    let fullReasoning = '';
    let chunkCount = 0;
    let totalBytes = 0;
    let provider = null;
    let finishReason = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunkCount++;
      totalBytes += value.length;
      const chunk = decoder.decode(value, { stream: true });

      // Parse SSE events
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ') && !line.includes('[DONE]')) {
          try {
            const json = JSON.parse(line.substring(6));

            // Capture provider from first chunk
            if (json.provider && !provider) {
              provider = json.provider;
              console.log(`Provider: ${provider}`);
            }

            // Capture content
            const delta = json.choices?.[0]?.delta || {};
            if (delta.content) {
              fullContent += delta.content;
            }
            if (delta.reasoning) {
              fullReasoning += delta.reasoning;
            }

            // Capture finish reason
            if (json.choices?.[0]?.finish_reason) {
              finishReason = json.choices[0].finish_reason;
            }
          } catch (e) {
            // Ignore parse errors for partial chunks
          }
        }
      }
    }

    console.log(`\nResults:`);
    console.log(`  Provider: ${provider}`);
    console.log(`  Chunks: ${chunkCount}`);
    console.log(`  Total bytes: ${totalBytes}`);
    console.log(`  Finish reason: ${finishReason}`);
    console.log(`  Reasoning length: ${fullReasoning.length} chars`);
    console.log(`  Content length: ${fullContent.length} chars`);
    console.log(`\nReasoning preview (first 200 chars):`);
    console.log(`  "${fullReasoning.substring(0, 200)}..."`);
    console.log(`\nContent preview (first 200 chars):`);
    console.log(`  "${fullContent.substring(0, 200)}..."`);

    // Check for truncation
    const reasoningEndsCleanly = fullReasoning.endsWith('.') ||
                                  fullReasoning.endsWith('!') ||
                                  fullReasoning.endsWith('?') ||
                                  fullReasoning.endsWith('\n') ||
                                  fullReasoning.length === 0;

    if (!reasoningEndsCleanly) {
      console.log(`\n⚠️  WARNING: Reasoning may be truncated!`);
      console.log(`  Last 50 chars: "...${fullReasoning.slice(-50)}"`);
    } else {
      console.log(`\n✓ Reasoning appears complete`);
    }

    return {
      provider,
      chunkCount,
      totalBytes,
      finishReason,
      reasoningLength: fullReasoning.length,
      contentLength: fullContent.length,
      reasoningComplete: reasoningEndsCleanly
    };

  } catch (error) {
    console.error('Error:', error.message);
    return null;
  }
}

async function main() {
  console.log('Provider Routing Comparison Test');
  console.log('================================\n');
  console.log('Testing if forcing Anthropic provider fixes reasoning cutoff issue\n');

  // Test 1: Default routing (likely goes to Google)
  const defaultResult = await testProvider(null, 'DEFAULT ROUTING (no provider specified)');

  // Wait a bit between requests
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 2: Force Anthropic provider
  const anthropicResult = await testProvider({
    provider: {
      order: ['Anthropic'],
      allow_fallbacks: false
    }
  }, 'FORCED ANTHROPIC PROVIDER');

  // Summary
  console.log('\n\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  if (defaultResult && anthropicResult) {
    console.log('\n| Metric | Default | Anthropic |');
    console.log('|--------|---------|-----------|');
    console.log(`| Provider | ${defaultResult.provider} | ${anthropicResult.provider} |`);
    console.log(`| Chunks | ${defaultResult.chunkCount} | ${anthropicResult.chunkCount} |`);
    console.log(`| Bytes | ${defaultResult.totalBytes} | ${anthropicResult.totalBytes} |`);
    console.log(`| Reasoning chars | ${defaultResult.reasoningLength} | ${anthropicResult.reasoningLength} |`);
    console.log(`| Content chars | ${defaultResult.contentLength} | ${anthropicResult.contentLength} |`);
    console.log(`| Complete | ${defaultResult.reasoningComplete ? '✓' : '❌'} | ${anthropicResult.reasoningComplete ? '✓' : '❌'} |`);
  }
}

main().catch(console.error);
