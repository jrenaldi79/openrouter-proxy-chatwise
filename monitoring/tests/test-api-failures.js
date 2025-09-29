#!/usr/bin/env node

/**
 * Test OpenRouter API Failures
 *
 * This script generates logs that should trigger the openrouter_api_failures metric
 * by making requests that will cause OpenRouter API communication issues
 */

const https = require('https');

const SERVICE_URL = 'https://openrouter-proxy-cjvukmm6za-uc.a.run.app';

function makeRequestWithInvalidKey(endpoint) {
  return new Promise((resolve) => {
    const url = `${SERVICE_URL}${endpoint}`;
    console.log(`🔍 Testing: ${url}`);

    const req = https.request(url, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer sk-or-v1-invalid-key-that-will-fail-12345'
      }
    }, (res) => {
      console.log(`   📊 Status: ${res.statusCode}`);

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`   📝 Response: ${data.substring(0, 100)}...`);
        resolve({ status: res.statusCode, data });
      });
    });

    req.on('error', (err) => {
      console.log(`   ❌ Network Error: ${err.message}`);
      resolve({ error: err.message });
    });

    req.end();
  });
}

async function triggerApiFailures() {
  console.log('🧪 Testing OpenRouter API Failures');
  console.log('🎯 Goal: Generate logs that mention "OpenRouter" and "error"');
  console.log('📊 This should populate the openrouter_api_failures metric\n');

  // Test endpoints that will try to reach OpenRouter with invalid keys
  const endpoints = [
    '/api/v1/me/credits',    // Our credit transformation endpoint
    '/api/v1/models',        // Models endpoint
    '/api/v1/key',          // Key info endpoint
  ];

  console.log('🔥 Making requests with invalid API key to trigger OpenRouter failures...\n');

  for (const endpoint of endpoints) {
    await makeRequestWithInvalidKey(endpoint);
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
  }

  console.log('\n✅ API failure test completed!');
  console.log('📊 Expected: Logs with OpenRouter API errors');
  console.log('⏰ Wait 2-3 minutes, then check if openrouter_api_failures metric appears');
  console.log('🔍 Metric should be visible in Google Cloud Console after data is generated');
}

triggerApiFailures();