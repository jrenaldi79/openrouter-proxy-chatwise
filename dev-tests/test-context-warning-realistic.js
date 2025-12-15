/**
 * Test context window warnings with realistic conversation flow
 *
 * This script simulates a real conversation that accumulates tokens over time
 * and checks for context warning messages being injected into the stream.
 */

const axios = require('axios');

const PROXY_URL = 'http://localhost:3000';
const API_KEY = process.env.OPENROUTER_TEST_API_KEY || 'sk-or-v1-your-test-key-here';

// Test with a model that has known limits
// Using a more widely available model to avoid routing issues
const TEST_MODEL = 'openai/gpt-3.5-turbo'; // Should have 16k token limit from OpenRouter

/**
 * Create a conversation with increasing message history
 * This simulates a real user conversation that grows over time
 */
function createConversation(turnCount) {
  const messages = [
    {
      role: 'system',
      content: 'You are a helpful assistant that provides detailed, comprehensive responses.'
    }
  ];

  // Add conversation turns
  for (let i = 1; i <= turnCount; i++) {
    messages.push({
      role: 'user',
      content: `This is message ${i}. Please give me a comprehensive explanation of the topic we're discussing. Include multiple paragraphs with detailed examples and thorough analysis. Make sure to cover all aspects of the subject matter in depth.`
    });

    // Simulate assistant responses (in a real conversation, these would be from previous API calls)
    if (i < turnCount) {
      messages.push({
        role: 'assistant',
        content: `Response to message ${i}: Here is a comprehensive explanation with multiple paragraphs. First paragraph covers the introduction and overview of the topic. Second paragraph delves into specific details and examples. Third paragraph provides analysis and deeper insights. Fourth paragraph discusses implications and applications. Fifth paragraph concludes with summary and recommendations. This is a detailed response that accumulates tokens in the conversation history.`
      });
    }
  }

  return messages;
}

/**
 * Make a streaming request and capture any context warnings
 */
async function testContextWarning(turnCount) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing with ${turnCount} conversation turns`);
  console.log(`${'='.repeat(80)}\n`);

  const messages = createConversation(turnCount);

  console.log(`📊 Message count: ${messages.length}`);
  console.log(`📝 Approximate input size: ${JSON.stringify(messages).length} characters\n`);

  try {
    const response = await axios.post(
      `${PROXY_URL}/v1/chat/completions`,
      {
        model: TEST_MODEL,
        messages: messages,
        stream: true,
        max_tokens: 500, // Short response to focus on warnings
      },
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        responseType: 'stream',
        timeout: 60000,
      }
    );

    let fullResponse = '';
    let warningDetected = false;
    let tokenUsage = null;

    // Process streaming response
    response.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);

          if (data === '[DONE]') {
            continue;
          }

          try {
            const parsed = JSON.parse(data);

            // Capture content
            if (parsed.choices?.[0]?.delta?.content) {
              fullResponse += parsed.choices[0].delta.content;
            }

            // Capture token usage
            if (parsed.usage) {
              tokenUsage = parsed.usage;
            }

            // Detect context warnings (they contain emoji indicators)
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content.includes('📊') || content.includes('⚠️') || content.includes('🚨')) {
              warningDetected = true;
              console.log('🎯 CONTEXT WARNING DETECTED:');
              console.log(content);
              console.log('');
            }
          } catch (e) {
            // Skip non-JSON lines
          }
        }
      }
    });

    // Wait for stream to complete
    await new Promise((resolve, reject) => {
      response.data.on('end', resolve);
      response.data.on('error', reject);
    });

    console.log('✅ Stream completed successfully\n');
    console.log('📄 Response preview (first 200 chars):');
    console.log(fullResponse.substring(0, 200).trim() + '...\n');

    if (tokenUsage) {
      console.log('📊 Token Usage:');
      console.log(`   Prompt tokens: ${tokenUsage.prompt_tokens}`);
      console.log(`   Completion tokens: ${tokenUsage.completion_tokens}`);
      console.log(`   Total tokens: ${tokenUsage.total_tokens}`);

      // Calculate percentage if we know the model limits
      // For Claude 3.5 Sonnet, we expect ~400k from OpenRouter API
      console.log('');
    }

    if (warningDetected) {
      console.log('\n✅ Context warning successfully injected!');
    } else {
      console.log('\nℹ️  No context warning (token usage below threshold)');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response?.data) {
      console.error('Response data:', error.response.data);
    }
  }
}

/**
 * Run progressive tests with increasing conversation length
 */
async function runTests() {
  console.log('\n🧪 Context Window Warning Test Suite\n');
  console.log(`Using model: ${TEST_MODEL}`);
  console.log(`Proxy URL: ${PROXY_URL}\n`);

  // Test with small conversation (should NOT trigger warning)
  await testContextWarning(3);

  // Test with medium conversation (should NOT trigger warning, but shows token usage)
  await testContextWarning(10);

  // Test with larger conversation (may trigger info-level warning at 25%)
  await testContextWarning(20);

  // Test with very large conversation (should trigger 📊 info warning at 25% = ~4k tokens)
  await testContextWarning(50);

  console.log('\n' + '='.repeat(80));
  console.log('📝 Test Notes:');
  console.log('   - Context warnings appear at 25% (📊), 40% (⚠️), and 50% (🚨)');
  console.log('   - For GPT-3.5 Turbo with ~16k limit:');
  console.log('     * 25% threshold = ~4k tokens');
  console.log('     * 40% threshold = ~6.4k tokens');
  console.log('     * 50% threshold = ~8k tokens');
  console.log('   - Natural conversations may need many turns to reach these thresholds');
  console.log('   - Check server logs for model limit lookup details');
  console.log('='.repeat(80) + '\n');
}

// Run the tests
runTests().catch(console.error);
