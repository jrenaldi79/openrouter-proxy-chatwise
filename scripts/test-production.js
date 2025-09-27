#!/usr/bin/env node

/**
 * Production Test Runner
 *
 * This script runs production tests against the deployed OpenRouter proxy service.
 * It tests real API connectivity and validates the production deployment.
 */

const { execSync } = require('child_process');
const https = require('https');

// Configuration
const SERVICE_URL = process.env.SERVICE_URL || 'https://openrouter-proxy-342936752541.us-central1.run.app';
const API_KEY = process.env.OPENROUTER_TEST_API_KEY;

console.log('🚀 Starting Production Test Suite...\n');

// Validate configuration
if (!API_KEY) {
  console.error('❌ Error: OPENROUTER_TEST_API_KEY environment variable is required');
  process.exit(1);
}

if (!API_KEY.startsWith('sk-or-v1-')) {
  console.error('❌ Error: Invalid API key format. Must start with sk-or-v1-');
  process.exit(1);
}

console.log(`📍 Service URL: ${SERVICE_URL}`);
console.log(`🔑 API Key: ${API_KEY.substring(0, 20)}...${API_KEY.substring(API_KEY.length - 8)}\n`);

// Test functions
async function testHealthCheck() {
  console.log('🏥 Testing Health Check...');

  try {
    const response = await fetch(`${SERVICE_URL}/health`);
    const data = await response.json();

    if (response.status === 200 && data.status === 'healthy' && data.openrouterConnectivity === 'connected') {
      console.log('✅ Health check passed');
      return true;
    } else {
      console.log('❌ Health check failed:', data);
      return false;
    }
  } catch (error) {
    console.log('❌ Health check error:', error.message);
    return false;
  }
}

async function testCreditsEndpoint() {
  console.log('💰 Testing Credits Endpoint...');

  try {
    const response = await fetch(`${SERVICE_URL}/v1/credits`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    });
    const data = await response.json();

    if (response.status === 200 && data.data && typeof data.data.total_credits === 'number') {
      console.log('✅ Credits endpoint passed');
      console.log(`   Credits: ${data.data.total_credits}, Usage: ${data.data.total_usage}`);
      return true;
    } else {
      console.log('❌ Credits endpoint failed:', data);
      return false;
    }
  } catch (error) {
    console.log('❌ Credits endpoint error:', error.message);
    return false;
  }
}

async function testAuthKeyEndpoint() {
  console.log('🔐 Testing Auth/Key Endpoint...');

  try {
    const response = await fetch(`${SERVICE_URL}/v1/auth/key`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    });
    const data = await response.json();

    if (response.status === 200 && data.data && data.data.label) {
      console.log('✅ Auth/Key endpoint passed');
      console.log(`   Label: ${data.data.label}, Valid: ${!data.data.is_provisioning_key}`);
      return true;
    } else {
      console.log('❌ Auth/Key endpoint failed:', data);
      return false;
    }
  } catch (error) {
    console.log('❌ Auth/Key endpoint error:', error.message);
    return false;
  }
}

async function testModelsEndpoint() {
  console.log('🤖 Testing Models Endpoint...');

  try {
    const response = await fetch(`${SERVICE_URL}/v1/models?limit=5`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    });
    const data = await response.json();

    if (response.status === 200 && data.data && Array.isArray(data.data) && data.data.length > 0) {
      console.log('✅ Models endpoint passed');
      console.log(`   Found ${data.data.length} models`);
      return true;
    } else {
      console.log('❌ Models endpoint failed:', data);
      return false;
    }
  } catch (error) {
    console.log('❌ Models endpoint error:', error.message);
    return false;
  }
}

async function testChatCompletions() {
  console.log('💬 Testing Chat Completions...');

  try {
    const response = await fetch(`${SERVICE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Say "Test successful" and nothing else' }],
        max_tokens: 5
      })
    });
    const data = await response.json();

    if (response.status === 200 && data.choices && data.choices.length > 0) {
      console.log('✅ Chat completions passed');
      console.log(`   Response: "${data.choices[0].message.content}"`);
      return true;
    } else {
      console.log('❌ Chat completions failed:', data);
      return false;
    }
  } catch (error) {
    console.log('❌ Chat completions error:', error.message);
    return false;
  }
}

// Main test runner
async function runProductionTests() {
  const tests = [
    testHealthCheck,
    testCreditsEndpoint,
    testAuthKeyEndpoint,
    testModelsEndpoint,
    testChatCompletions
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const result = await test();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.log(`❌ Test error: ${error.message}`);
      failed++;
    }
    console.log(''); // Empty line for readability
  }

  console.log('📊 Production Test Results:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%\n`);

  if (failed === 0) {
    console.log('🎉 All production tests passed! Service is ready for ChatWise integration.');
    process.exit(0);
  } else {
    console.log('⚠️  Some production tests failed. Please review before deploying to ChatWise.');
    process.exit(1);
  }
}

// Run the tests
runProductionTests().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});