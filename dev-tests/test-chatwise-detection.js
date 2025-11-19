/**
 * Test script to verify ChatWise client detection
 * Tests both OLD and NEW detection methods
 */

const axios = require('axios');

const PROXY_URL = 'http://localhost:3000';
const API_KEY = process.env.OPENROUTER_TEST_API_KEY;

if (!API_KEY) {
  console.error('❌ OPENROUTER_TEST_API_KEY not set');
  process.exit(1);
}

async function testDetection(testName, headers, shouldDetect) {
  console.log(`\n🧪 ${testName}`);
  console.log('─'.repeat(80));
  console.log('Headers:', JSON.stringify(headers, null, 2));

  try {
    const response = await axios({
      method: 'POST',
      url: `${PROXY_URL}/v1/chat/completions`,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        ...headers
      },
      data: {
        model: 'openai/gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Test' }],
        stream: true,
        max_tokens: 10
      },
      responseType: 'stream'
    });

    let firstChunk = '';
    let hasBalance = false;

    response.data.on('data', (chunk) => {
      const chunkStr = chunk.toString();
      if (!firstChunk) {
        firstChunk = chunkStr;
      }
      if (chunkStr.includes('💰')) {
        hasBalance = true;
      }
    });

    await new Promise((resolve) => response.data.on('end', resolve));

    const result = hasBalance ? '✅ DETECTED as ChatWise' : '❌ NOT detected as ChatWise';
    const expected = shouldDetect ? '✅ (expected)' : '❌ (unexpected)';

    console.log(`${result} ${expected}`);

    if (hasBalance === shouldDetect) {
      console.log('✅ TEST PASSED');
    } else {
      console.log('❌ TEST FAILED');
    }

  } catch (error) {
    console.error('❌ Request error:', error.message);
  }
}

async function runTests() {
  console.log('🔍 ChatWise Client Detection Tests');
  console.log('Testing OLD and NEW detection methods');
  console.log('='.repeat(80));

  // OLD METHODS (should still work)
  await testDetection(
    'OLD: User-Agent with "chatwise"',
    { 'User-Agent': 'ChatWise/1.0' },
    true
  );

  await testDetection(
    'OLD: User-Agent with "electron"',
    { 'User-Agent': 'Mozilla/5.0 Electron/25.0' },
    true
  );

  await testDetection(
    'OLD: Origin with "chatwise"',
    {
      'User-Agent': 'Mozilla/5.0',
      'Origin': 'chatwise://app'
    },
    true
  );

  await testDetection(
    'OLD: Desktop app pattern (no origin/referer, macintosh+chrome)',
    {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0'
    },
    true
  );

  // NEW METHOD (ChatWise's current version)
  await testDetection(
    'NEW: User-Agent with "ai-sdk/openrouter"',
    { 'User-Agent': 'ai-sdk/openrouter/1.2.1' },
    true
  );

  // NON-CHATWISE (should NOT be detected)
  await testDetection(
    'NEGATIVE: Regular browser with origin',
    {
      'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0',
      'Origin': 'https://example.com'
    },
    false
  );

  console.log('\n' + '='.repeat(80));
  console.log('✅ All tests completed');
}

runTests().catch(console.error);
