/**
 * Manual test script for context window warnings
 * Tests different token usage levels to trigger info, warning, and critical alerts
 */

const axios = require('axios');

const PROXY_URL = 'http://localhost:3000';
const API_KEY = process.env.OPENROUTER_TEST_API_KEY;

if (!API_KEY) {
  console.error('❌ OPENROUTER_TEST_API_KEY environment variable not set');
  process.exit(1);
}

/**
 * Create a message with approximately N tokens
 * Rough estimate: 1 token ≈ 4 characters
 */
function createMessageWithTokens(approxTokens) {
  const charsNeeded = approxTokens * 4;
  const text = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(
    Math.ceil(charsNeeded / 57)
  );
  return text.substring(0, charsNeeded);
}

/**
 * Test context warning with specific token usage
 */
async function testContextWarning(testName, model, approxPromptTokens) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 ${testName}`);
  console.log(`Model: ${model}`);
  console.log(`Approximate prompt tokens: ${approxPromptTokens.toLocaleString()}`);
  console.log(`${'='.repeat(80)}\n`);

  try {
    // Create a large message history to simulate high token usage
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful assistant. Keep responses brief.',
      },
      {
        role: 'user',
        content: createMessageWithTokens(approxPromptTokens),
      },
      {
        role: 'user',
        content: 'Please respond with just "OK" to confirm you received this.',
      },
    ];

    const response = await axios.post(
      `${PROXY_URL}/v1/chat/completions`,
      {
        model: model,
        messages: messages,
        max_tokens: 10,
        stream: true,
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        responseType: 'stream',
      }
    );

    let fullResponse = '';
    let sawWarning = false;
    let warningText = '';

    response.data.on('data', chunk => {
      const chunkStr = chunk.toString();
      fullResponse += chunkStr;

      // Look for context warnings in the stream
      if (
        chunkStr.includes('📊 Context:') ||
        chunkStr.includes('⚠️ Context:') ||
        chunkStr.includes('🚨 Context:')
      ) {
        sawWarning = true;
        // Extract the warning message
        const lines = chunkStr.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: {')) {
            try {
              const jsonStr = line.substring(6);
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              if (
                content &&
                (content.includes('📊 Context:') ||
                  content.includes('⚠️ Context:') ||
                  content.includes('🚨 Context:'))
              ) {
                warningText += content;
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
    });

    await new Promise((resolve, reject) => {
      response.data.on('end', resolve);
      response.data.on('error', reject);
    });

    if (sawWarning) {
      console.log('✅ Context warning detected!');
      console.log('\n📝 Warning message:');
      console.log(warningText.trim());
    } else {
      console.log('ℹ️  No context warning (usage below threshold)');
    }

    // Extract actual token usage from response
    const usageMatch = fullResponse.match(/"usage":\s*\{[^}]+\}/);
    if (usageMatch) {
      try {
        const usage = JSON.parse(usageMatch[0].replace(/"usage":\s*/, ''));
        console.log('\n📊 Actual token usage:');
        console.log(
          `   Prompt: ${usage.prompt_tokens?.toLocaleString() || 'N/A'}`
        );
        console.log(
          `   Completion: ${usage.completion_tokens?.toLocaleString() || 'N/A'}`
        );
        console.log(
          `   Total: ${usage.total_tokens?.toLocaleString() || 'N/A'}`
        );
      } catch (e) {
        console.log('\n⚠️  Could not parse usage data');
      }
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('\n🚀 Testing Context Window Warning Feature\n');

  // Test 1: Low usage (no warning expected)
  await testContextWarning(
    'Test 1: Low Token Usage (No Warning)',
    'anthropic/claude-3-5-sonnet',
    5000 // ~1.25% of 400k limit
  );

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 2: 25% usage (info warning expected)
  await testContextWarning(
    'Test 2: 25% Token Usage (Info Warning)',
    'anthropic/claude-3-5-sonnet',
    100000 // 25% of 400k limit
  );

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 3: 40% usage (warning expected)
  await testContextWarning(
    'Test 3: 40% Token Usage (Warning)',
    'anthropic/claude-3-5-sonnet',
    160000 // 40% of 400k limit
  );

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 4: 50% usage (critical warning expected)
  await testContextWarning(
    'Test 4: 50% Token Usage (Critical Warning)',
    'anthropic/claude-3-5-sonnet',
    200000 // 50% of 400k limit
  );

  console.log('\n✅ All tests completed!\n');
}

// Run tests
runTests().catch(console.error);
