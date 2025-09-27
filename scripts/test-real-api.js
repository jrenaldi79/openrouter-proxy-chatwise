#!/usr/bin/env node

/**
 * Real API Key Testing Script
 *
 * This script tests the OpenRouter proxy with a real API key.
 *
 * Usage:
 * 1. Set your real API key: export OPENROUTER_TEST_API_KEY="sk-or-v1-your-key-here"
 * 2. Start the proxy server: npm run dev
 * 3. Run this script: node scripts/test-real-api.js
 */

const axios = require('axios');

const PROXY_BASE_URL = 'http://localhost:3000';
const API_KEY = process.env.OPENROUTER_TEST_API_KEY;

async function testRealAPI() {
  if (!API_KEY) {
    console.log('❌ No API key found. Please set OPENROUTER_TEST_API_KEY environment variable.');
    console.log('   Example: export OPENROUTER_TEST_API_KEY="sk-or-v1-your-key-here"');
    process.exit(1);
  }

  if (!API_KEY.startsWith('sk-or-v1-')) {
    console.log('❌ Invalid API key format. Must start with "sk-or-v1-"');
    process.exit(1);
  }

  console.log('🧪 Testing OpenRouter Proxy with real API key...\n');

  try {
    // Test 1: Health Check
    console.log('1️⃣ Testing health check...');
    const healthResponse = await axios.get(`${PROXY_BASE_URL}/health`);
    console.log(`   ✅ Health: ${healthResponse.data.status} (${healthResponse.data.openrouterConnectivity})\n`);

    // Test 2: Credit Information
    console.log('2️⃣ Testing credit information...');
    const creditsResponse = await axios.get(`${PROXY_BASE_URL}/api/v1/me/credits`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` }
    });

    console.log('   ✅ Credits endpoint working!');
    console.log(`   📊 Response: ${JSON.stringify(creditsResponse.data, null, 2)}\n`);

    // Test 3: Models List
    console.log('3️⃣ Testing models list...');
    const modelsResponse = await axios.get(`${PROXY_BASE_URL}/api/v1/models`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` }
    });

    console.log('   ✅ Models endpoint working!');
    console.log(`   📋 Found ${modelsResponse.data.data?.length || 0} models\n`);

    // Test 4: Invalid Method
    console.log('4️⃣ Testing method validation...');
    try {
      await axios.post(`${PROXY_BASE_URL}/api/v1/me/credits`, {}, {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
      });
      console.log('   ❌ Method validation failed - should have returned 405');
    } catch (error) {
      if (error.response?.status === 405) {
        console.log('   ✅ Method validation working! (405 Method Not Allowed)\n');
      } else {
        console.log(`   ❓ Unexpected error: ${error.response?.status}\n`);
      }
    }

    console.log('🎉 All tests passed! The proxy is working correctly with your real API key.');

  } catch (error) {
    if (error.response) {
      console.log(`❌ API Error: ${error.response.status} ${error.response.statusText}`);
      console.log(`   Response: ${JSON.stringify(error.response.data, null, 2)}`);
    } else if (error.code === 'ECONNREFUSED') {
      console.log('❌ Connection refused. Make sure the proxy server is running on port 3000.');
      console.log('   Start it with: npm run dev');
    } else {
      console.log(`❌ Error: ${error.message}`);
    }
    process.exit(1);
  }
}

// Run the test
testRealAPI();