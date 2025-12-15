/**
 * Test context warning with a LARGE conversation (150 turns = ~4,000+ tokens)
 * This should trigger the 25% info-level warning (📊)
 */

const axios = require('axios');

const PROXY_URL = 'http://localhost:3000';
const API_KEY = process.env.OPENROUTER_TEST_API_KEY || 'sk-or-v1-your-test-key-here';
const TEST_MODEL = 'openai/gpt-3.5-turbo';

// Create a 150-turn conversation to get ~4,000+ tokens
const messages = [{ role: 'system', content: 'You are a helpful assistant.' }];

for (let i = 1; i <= 150; i++) {
  messages.push({
    role: 'user',
    content: `Message ${i}. Please provide a detailed explanation with multiple paragraphs.`
  });

  if (i < 150) {
    messages.push({
      role: 'assistant',
      content: `Response ${i}. Here is a comprehensive explanation with multiple paragraphs covering the topic in depth. This response includes detailed information and thorough analysis.`
    });
  }
}

console.log('\n🧪 Testing Large Conversation (150 turns = 300 messages)\n');
console.log('Expected: ~4,000+ tokens (should trigger 📊 info warning at 25%)\n');
console.log('Check for warning in the response stream...\n');

async function testLargeConversation() {
  try {
    const response = await axios.post(
      `${PROXY_URL}/v1/chat/completions`,
      {
        model: TEST_MODEL,
        messages,
        stream: true,
        max_tokens: 50,
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

    response.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            fullResponse += content;

            // Detect context warning (contains emoji indicators)
            if (content.includes('📊') || content.includes('⚠️') || content.includes('🚨')) {
              warningDetected = true;
              console.log('🎯 **CONTEXT WARNING DETECTED!**');
              console.log(content);
              console.log('');
            }
          } catch (e) {
            // Skip non-JSON lines
          }
        }
      }
    });

    response.data.on('end', () => {
      console.log('✅ Stream completed\n');
      console.log('📄 Response preview:');
      console.log(fullResponse.substring(0, 200) + '...\n');

      if (warningDetected) {
        console.log('✅ SUCCESS! Context warning was injected into the stream!');
      } else {
        console.log('ℹ️  No warning detected. Check server logs for token count.');
        console.log('   If promptTokens < 4096, increase conversation size.');
      }

      console.log('\n💡 Check server logs for "Context warning check" to see actual token count\n');
      process.exit(0);
    });

    response.data.on('error', (error) => {
      console.error('❌ Stream error:', error.message);
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ Request failed:', error.message);
    process.exit(1);
  }
}

testLargeConversation();
