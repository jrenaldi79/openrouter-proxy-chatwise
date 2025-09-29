#!/usr/bin/env node

/**
 * Test Balance Injection Feature
 *
 * This script tests the new balance injection feature for new chat sessions
 */

const http = require('http');

const SERVICE_URL = 'http://localhost:3000';
const TEST_API_KEY = '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';

function makeStreamingChatRequest(messages, shouldTriggerBalance = true) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      model: 'openai/gpt-3.5-turbo',
      messages: messages,
      stream: true,
      max_tokens: 100,
    });

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_API_KEY}`,
        'Content-Length': Buffer.byteLength(requestBody),
      },
    };

    console.log(`\n🧪 Testing ${shouldTriggerBalance ? 'NEW' : 'EXISTING'} session with ${messages.length} message(s)`);
    console.log(`📝 Messages: ${JSON.stringify(messages)}`);

    const req = http.request(options, (res) => {
      console.log(`📊 Status: ${res.statusCode}`);
      console.log(`📋 Headers: ${JSON.stringify(res.headers)}`);

      let chunks = [];
      let hasBalanceMessage = false;
      let chunkCount = 0;

      res.on('data', (chunk) => {
        const chunkStr = chunk.toString();
        chunkCount++;
        console.log(`📦 Chunk ${chunkCount}: ${chunkStr}`);

        // Check if this chunk contains balance information
        if (chunkStr.includes('💰') || chunkStr.includes('Balance') || chunkStr.includes('credits')) {
          hasBalanceMessage = true;
          console.log(`✅ Balance message detected in chunk ${chunkCount}!`);
        }

        chunks.push(chunkStr);
      });

      res.on('end', () => {
        console.log(`🏁 Stream ended. Total chunks: ${chunkCount}`);
        console.log(`💰 Balance message found: ${hasBalanceMessage ? 'YES' : 'NO'}`);

        if (shouldTriggerBalance && !hasBalanceMessage) {
          console.log(`❌ Expected balance message but didn't find one`);
        } else if (!shouldTriggerBalance && hasBalanceMessage) {
          console.log(`❌ Unexpected balance message for existing session`);
        } else {
          console.log(`✅ Result matches expectation`);
        }

        resolve({
          statusCode: res.statusCode,
          chunks: chunks,
          hasBalanceMessage: hasBalanceMessage,
          chunkCount: chunkCount,
        });
      });
    });

    req.on('error', (error) => {
      console.error(`❌ Request error: ${error.message}`);
      reject(error);
    });

    req.write(requestBody);
    req.end();
  });
}

async function testBalanceInjection() {
  console.log('🚀 Testing Balance Injection Feature');
  console.log('🎯 Goal: Verify balance appears for new sessions only\n');

  try {
    // Test 1: New session (single user message) - should trigger balance
    console.log('=' .repeat(60));
    console.log('TEST 1: New Session (should show balance)');
    console.log('=' .repeat(60));

    const newSessionResult = await makeStreamingChatRequest([
      { role: 'user', content: 'Hello! This is a new conversation.' }
    ], true);

    // Test 2: Existing session (multiple messages) - should NOT trigger balance
    console.log('\n' + '=' .repeat(60));
    console.log('TEST 2: Existing Session (should NOT show balance)');
    console.log('=' .repeat(60));

    const existingSessionResult = await makeStreamingChatRequest([
      { role: 'user', content: 'Hello!' },
      { role: 'assistant', content: 'Hi there! How can I help you?' },
      { role: 'user', content: 'Tell me about the weather.' }
    ], false);

    // Test 3: Non-streaming request (should NOT trigger balance in current prototype)
    console.log('\n' + '=' .repeat(60));
    console.log('TEST 3: Non-streaming New Session (should NOT show balance in prototype)');
    console.log('=' .repeat(60));

    // For non-streaming, we'll make a regular request
    const nonStreamingResponse = await new Promise((resolve, reject) => {
      const requestBody = JSON.stringify({
        model: 'openai/gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello! Non-streaming test.' }],
        stream: false,
        max_tokens: 50,
      });

      const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_API_KEY}`,
          'Content-Length': Buffer.byteLength(requestBody),
        },
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          console.log(`📊 Status: ${res.statusCode}`);
          console.log(`📝 Response: ${data.substring(0, 200)}...`);
          resolve({ statusCode: res.statusCode, data });
        });
      });

      req.on('error', reject);
      req.write(requestBody);
      req.end();
    });

    // Summary
    console.log('\n' + '🎯 TEST SUMMARY');
    console.log('=' .repeat(60));
    console.log(`✅ New session balance injection: ${newSessionResult.hasBalanceMessage ? 'WORKING' : 'FAILED'}`);
    console.log(`✅ Existing session no balance: ${!existingSessionResult.hasBalanceMessage ? 'WORKING' : 'FAILED'}`);
    console.log(`✅ Non-streaming bypassed: ${nonStreamingResponse.statusCode === 200 ? 'WORKING' : 'FAILED'}`);

    console.log('\n🎉 Balance injection prototype test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testBalanceInjection();