/**
 * Test script for balance injection feature
 * Tests all conditions required for balance injection to work
 */

const axios = require('axios');

const PROXY_URL = 'http://localhost:3000';
const API_KEY = process.env.OPENROUTER_TEST_API_KEY;

if (!API_KEY) {
  console.error('❌ OPENROUTER_TEST_API_KEY not set');
  process.exit(1);
}

// Test 1: ChatWise-like client with streaming (SHOULD inject balance)
async function testChatWiseStreaming() {
  console.log('\n🧪 Test 1: ChatWise client with streaming (SHOULD inject balance)');
  console.log('=' .repeat(80));

  try {
    const response = await axios({
      method: 'POST',
      url: `${PROXY_URL}/v1/chat/completions`,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        // Simulate ChatWise desktop client headers
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0',
        // No origin/referer (desktop app pattern)
      },
      data: {
        model: 'openai/gpt-3.5-turbo',
        messages: [
          { role: 'user', content: 'Hello, what is 2+2?' }
        ],
        stream: true, // CRITICAL: Must be true for balance injection
        max_tokens: 100
      },
      responseType: 'stream'
    });

    console.log(`✅ Status: ${response.status}`);
    console.log(`✅ Headers:`, response.headers);

    let firstChunk = '';
    let balanceFound = false;

    response.data.on('data', (chunk) => {
      const chunkStr = chunk.toString();
      if (!firstChunk) {
        firstChunk = chunkStr;
        console.log(`\n📦 First chunk received:`);
        console.log(chunkStr.substring(0, 500));

        // Check if balance message is present
        if (chunkStr.includes('💰')) {
          balanceFound = true;
          console.log(`\n✅ BALANCE FOUND! Balance injection is working!`);
        }
      }
    });

    response.data.on('end', () => {
      if (!balanceFound) {
        console.log(`\n❌ BALANCE NOT FOUND - Check server logs for which condition failed`);
        console.log(`   Possible issues:`);
        console.log(`   - Not detected as ChatWise client`);
        console.log(`   - Not detected as new session`);
        console.log(`   - Auth token invalid`);
        console.log(`   - Streaming not enabled`);
      }
      console.log(`\n✅ Stream completed`);
    });

    await new Promise((resolve) => response.data.on('end', resolve));

  } catch (error) {
    console.error(`❌ Error:`, error.response?.data || error.message);
  }
}

// Test 2: Non-ChatWise client (SHOULD NOT inject balance)
async function testNonChatWise() {
  console.log('\n🧪 Test 2: Non-ChatWise client (SHOULD NOT inject balance)');
  console.log('=' .repeat(80));

  try {
    const response = await axios({
      method: 'POST',
      url: `${PROXY_URL}/v1/chat/completions`,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'TestClient/1.0',
        'Origin': 'https://example.com', // Has origin (not desktop app)
      },
      data: {
        model: 'openai/gpt-3.5-turbo',
        messages: [
          { role: 'user', content: 'Hello' }
        ],
        stream: true,
        max_tokens: 50
      },
      responseType: 'stream'
    });

    console.log(`✅ Status: ${response.status}`);

    let balanceFound = false;

    response.data.on('data', (chunk) => {
      const chunkStr = chunk.toString();
      if (chunkStr.includes('💰')) {
        balanceFound = true;
      }
    });

    response.data.on('end', () => {
      if (balanceFound) {
        console.log(`\n❌ UNEXPECTED: Balance was injected for non-ChatWise client`);
      } else {
        console.log(`\n✅ Correct: No balance injection for non-ChatWise client`);
      }
    });

    await new Promise((resolve) => response.data.on('end', resolve));

  } catch (error) {
    console.error(`❌ Error:`, error.response?.data || error.message);
  }
}

// Test 3: Non-streaming request (SHOULD NOT inject balance)
async function testNonStreaming() {
  console.log('\n🧪 Test 3: Streaming disabled (SHOULD NOT inject balance)');
  console.log('=' .repeat(80));

  try {
    const response = await axios({
      method: 'POST',
      url: `${PROXY_URL}/v1/chat/completions`,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0',
      },
      data: {
        model: 'openai/gpt-3.5-turbo',
        messages: [
          { role: 'user', content: 'Hello' }
        ],
        stream: false, // Streaming disabled
        max_tokens: 50
      }
    });

    console.log(`✅ Status: ${response.status}`);

    const content = response.data?.choices?.[0]?.message?.content || '';
    if (content.includes('💰')) {
      console.log(`\n❌ UNEXPECTED: Balance was injected for non-streaming request`);
    } else {
      console.log(`\n✅ Correct: No balance injection for non-streaming request`);
    }

  } catch (error) {
    console.error(`❌ Error:`, error.response?.data || error.message);
  }
}

// Test 4: Multi-turn conversation (SHOULD NOT inject balance)
async function testMultiTurn() {
  console.log('\n🧪 Test 4: Multi-turn conversation (SHOULD NOT inject balance)');
  console.log('=' .repeat(80));

  try {
    const response = await axios({
      method: 'POST',
      url: `${PROXY_URL}/v1/chat/completions`,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0',
      },
      data: {
        model: 'openai/gpt-3.5-turbo',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'How are you?' }
        ],
        stream: true,
        max_tokens: 50
      },
      responseType: 'stream'
    });

    console.log(`✅ Status: ${response.status}`);

    let balanceFound = false;

    response.data.on('data', (chunk) => {
      const chunkStr = chunk.toString();
      if (chunkStr.includes('💰')) {
        balanceFound = true;
      }
    });

    response.data.on('end', () => {
      if (balanceFound) {
        console.log(`\n❌ UNEXPECTED: Balance was injected for multi-turn conversation`);
      } else {
        console.log(`\n✅ Correct: No balance injection for multi-turn conversation`);
      }
    });

    await new Promise((resolve) => response.data.on('end', resolve));

  } catch (error) {
    console.error(`❌ Error:`, error.response?.data || error.message);
  }
}

// Run all tests
async function runTests() {
  console.log('🔍 Balance Injection Diagnostic Tests');
  console.log('=' .repeat(80));
  console.log(`Proxy URL: ${PROXY_URL}`);
  console.log(`API Key: ${API_KEY.substring(0, 20)}...`);
  console.log(`\nNOTE: Check server logs for detailed balance injection debug info`);

  await testChatWiseStreaming();
  await new Promise(resolve => setTimeout(resolve, 1000));

  await testNonChatWise();
  await new Promise(resolve => setTimeout(resolve, 1000));

  await testNonStreaming();
  await new Promise(resolve => setTimeout(resolve, 1000));

  await testMultiTurn();

  console.log('\n' + '=' .repeat(80));
  console.log('✅ All tests completed');
  console.log('\nIf Test 1 shows "BALANCE NOT FOUND", check the server logs to see');
  console.log('which condition failed. Look for log lines starting with [BALANCE]');
}

runTests().catch(console.error);
