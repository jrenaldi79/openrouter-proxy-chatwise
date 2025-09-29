#!/usr/bin/env node

/**
 * OpenRouter Proxy Monitoring Test Script
 *
 * This script tests the monitoring setup by:
 * 1. Making requests to trigger different monitoring metrics
 * 2. Checking service health
 * 3. Verifying log-based metrics are working
 */

const https = require('https');

const SERVICE_URL = 'https://openrouter-proxy-cjvukmm6za-uc.a.run.app';

async function makeRequest(path, expectedStatus = 200) {
  return new Promise((resolve, reject) => {
    const url = `${SERVICE_URL}${path}`;
    console.log(`🔍 Testing: ${url}`);

    const startTime = Date.now();

    https.get(url, (res) => {
      const duration = Date.now() - startTime;
      const status = res.statusCode;

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`   ✅ Status: ${status}, Duration: ${duration}ms`);
        if (status >= 400) {
          console.log(`   📊 This should trigger: openrouter_proxy_errors metric`);
        }
        if (duration > 2000) {
          console.log(`   🐌 This should trigger: openrouter_proxy_high_latency metric`);
        }
        resolve({ status, duration, data });
      });
    }).on('error', (err) => {
      console.log(`   ❌ Error: ${err.message}`);
      console.log(`   📊 This should trigger: openrouter_api_failures metric`);
      reject(err);
    });
  });
}

async function testMonitoring() {
  console.log('🚀 OpenRouter Proxy Monitoring Test\n');

  try {
    // Test 1: Health check (should succeed)
    console.log('📋 Test 1: Health Check');
    await makeRequest('/health', 200);

    // Test 2: Valid API endpoint (should succeed)
    console.log('\n📋 Test 2: API Root');
    await makeRequest('/api', 200);

    // Test 3: Nonexistent endpoint (should trigger error metric)
    console.log('\n📋 Test 3: 404 Error (triggers error metric)');
    await makeRequest('/api/v1/nonexistent', 404);

    // Test 4: Another error to reach threshold
    console.log('\n📋 Test 4: Another 404 Error');
    await makeRequest('/api/v1/another-nonexistent', 404);

    console.log('\n✅ Monitoring test completed!');
    console.log('\n📊 Expected metrics to be generated:');
    console.log('   - openrouter_proxy_errors: 2 (from 404 responses)');
    console.log('   - Request logs should appear in Cloud Logging');

    console.log('\n🔍 Check your metrics in 2-3 minutes at:');
    console.log('   https://console.cloud.google.com/monitoring?project=northwestern-sandbox');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testMonitoring();