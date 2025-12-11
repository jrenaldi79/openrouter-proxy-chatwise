/**
 * Stress test to reproduce intermittent reasoning cutoff
 *
 * Simulates the conversation pattern that caused the cutoff:
 * - Multiple messages (like the 32-message conversation)
 * - Large context
 * - Reasoning enabled
 */

const API_KEY = process.env.OPENROUTER_TEST_API_KEY;

if (!API_KEY) {
  console.error('ERROR: Set OPENROUTER_TEST_API_KEY environment variable');
  process.exit(1);
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Simulate a multi-turn conversation
function buildConversation(turns) {
  const messages = [
    { role: 'system', content: 'You are a helpful coding assistant. Think through problems carefully before responding.' }
  ];

  for (let i = 0; i < turns; i++) {
    messages.push({
      role: 'user',
      content: `Question ${i + 1}: Explain a concept related to software development. Be thorough but concise. Topic: ${['async/await', 'closures', 'dependency injection', 'event loops', 'caching strategies', 'database indexing', 'API design', 'error handling'][i % 8]}`
    });

    if (i < turns - 1) {
      messages.push({
        role: 'assistant',
        content: `Here's an explanation of the topic. ${'.'.repeat(100)} This represents a longer response to simulate real conversation history.`
      });
    }
  }

  return messages;
}

async function testWithProvider(providerConfig, label, numTurns) {
  const messages = buildConversation(numTurns);

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${label} (${numTurns} turns, ${messages.length} messages)`);
  console.log('─'.repeat(60));

  const requestBody = {
    model: 'anthropic/claude-sonnet-4.5',
    messages,
    stream: true,
    max_tokens: 16000,
    reasoning: {
      max_tokens: 8000
    },
    ...providerConfig
  };

  const bodySize = JSON.stringify(requestBody).length;
  console.log(`Body size: ${bodySize} bytes`);

  try {
    const startTime = Date.now();
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://test.example.com',
        'X-Title': 'Provider Stress Test'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`HTTP Error ${response.status}:`, errorText.substring(0, 500));
      return { success: false, error: `HTTP ${response.status}` };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let fullReasoning = '';
    let fullContent = '';
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

      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ') && !line.includes('[DONE]')) {
          try {
            const json = JSON.parse(line.substring(6));
            if (json.provider && !provider) provider = json.provider;

            const delta = json.choices?.[0]?.delta || {};
            if (delta.content) fullContent += delta.content;
            if (delta.reasoning) fullReasoning += delta.reasoning;
            if (json.choices?.[0]?.finish_reason) finishReason = json.choices[0].finish_reason;
          } catch (e) {}
        }
      }
    }

    const elapsed = Date.now() - startTime;

    // Check for truncation indicators
    const lastReasoningWord = fullReasoning.trim().split(/\s+/).pop() || '';
    const endsWithIncompleteWord = lastReasoningWord.length > 0 &&
      !lastReasoningWord.match(/[.!?,;:\-\n\d]$/) &&
      lastReasoningWord.length < 15; // Likely cut off mid-word

    const truncated = endsWithIncompleteWord;

    console.log(`Provider: ${provider}`);
    console.log(`Time: ${elapsed}ms`);
    console.log(`Chunks: ${chunkCount}, Bytes: ${totalBytes}`);
    console.log(`Reasoning: ${fullReasoning.length} chars, Content: ${fullContent.length} chars`);
    console.log(`Finish reason: ${finishReason}`);

    if (truncated) {
      console.log(`❌ TRUNCATED! Last word: "${lastReasoningWord}"`);
      console.log(`   Last 100 chars of reasoning: "...${fullReasoning.slice(-100)}"`);
    } else {
      console.log(`✓ Complete`);
    }

    return {
      success: true,
      provider,
      chunkCount,
      totalBytes,
      reasoningLength: fullReasoning.length,
      contentLength: fullContent.length,
      truncated,
      lastWord: lastReasoningWord,
      elapsed
    };

  } catch (error) {
    console.error('Error:', error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('Provider Stress Test - Trying to Reproduce Intermittent Cutoff');
  console.log('================================================================\n');

  const results = {
    google: { total: 0, truncated: 0 },
    anthropic: { total: 0, truncated: 0 }
  };

  // Run multiple tests with varying conversation lengths
  const testRuns = 3;
  const turnsPerTest = [8, 12, 16]; // Varying conversation lengths

  for (let run = 0; run < testRuns; run++) {
    const turns = turnsPerTest[run % turnsPerTest.length];

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`RUN ${run + 1}/${testRuns} - ${turns} conversation turns`);
    console.log('═'.repeat(60));

    // Test with default routing (Google)
    const googleResult = await testWithProvider(null, 'DEFAULT (Google)', turns);
    if (googleResult.success) {
      results.google.total++;
      if (googleResult.truncated) results.google.truncated++;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test with forced Anthropic
    const anthropicResult = await testWithProvider({
      provider: { order: ['Anthropic'], allow_fallbacks: false }
    }, 'FORCED ANTHROPIC', turns);
    if (anthropicResult.success) {
      results.anthropic.total++;
      if (anthropicResult.truncated) results.anthropic.truncated++;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Summary
  console.log('\n\n' + '═'.repeat(60));
  console.log('FINAL SUMMARY');
  console.log('═'.repeat(60));
  console.log(`\nGoogle (default routing):`);
  console.log(`  Tests: ${results.google.total}`);
  console.log(`  Truncated: ${results.google.truncated} (${((results.google.truncated / results.google.total) * 100).toFixed(1)}%)`);
  console.log(`\nAnthropic (forced):`);
  console.log(`  Tests: ${results.anthropic.total}`);
  console.log(`  Truncated: ${results.anthropic.truncated} (${((results.anthropic.truncated / results.anthropic.total) * 100).toFixed(1)}%)`);

  if (results.google.truncated > results.anthropic.truncated) {
    console.log(`\n⚠️  Google provider shows more truncation issues!`);
    console.log(`   Recommendation: Force Anthropic provider for Claude models`);
  } else if (results.google.truncated === 0 && results.anthropic.truncated === 0) {
    console.log(`\n✓ No truncation detected in this test run`);
    console.log(`  Note: The intermittent issue may require more tests to reproduce`);
  }
}

main().catch(console.error);
