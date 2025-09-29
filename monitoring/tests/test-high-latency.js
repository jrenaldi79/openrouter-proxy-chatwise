#!/usr/bin/env node

/**
 * Test High Latency Alert
 *
 * This script attempts to generate slow requests (>2 seconds) to trigger the high latency alert.
 * Note: Since our proxy is fast, we'll make many requests simultaneously to potentially
 * create resource contention and slower responses.
 */

const https = require('https');

const SERVICE_URL = 'https://openrouter-proxy-cjvukmm6za-uc.a.run.app';

function makeSlowRequest(path, delay = 0) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const url = `${SERVICE_URL}${path}`;
      console.log(`🐌 Testing: ${url}`);

      const startTime = Date.now();

      https.get(url, (res) => {
        const duration = Date.now() - startTime;
        console.log(`   ⏰ Status: ${res.statusCode}, Duration: ${duration}ms`);

        if (duration > 2000) {
          console.log(`   🎯 SLOW REQUEST! This should trigger high latency metric`);
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({ status: res.statusCode, duration });
        });
      }).on('error', (err) => {
        console.log(`   ❌ Error: ${err.message}`);
        resolve({ error: err.message });
      });
    }, delay);
  });
}

async function triggerHighLatency() {
  console.log('🐌 Testing High Latency Alert');
  console.log('🎯 Goal: Generate requests >2 seconds to trigger latency alert');
  console.log('📧 Alert should be sent to: jrenaldi79@gmail.com\n');

  // Strategy: Make many concurrent requests to potentially create resource contention
  // This might slow down some requests due to Cloud Run scaling/resource limits
  console.log('🔥 Making 20 concurrent requests to potentially slow responses...\n');

  const promises = [];
  for (let i = 1; i <= 20; i++) {
    // Mix of different endpoints to create varied load
    const endpoints = ['/health', '/api', '/api/v1/models', '/api/v1/nonexistent'];
    const endpoint = endpoints[i % endpoints.length];
    promises.push(makeSlowRequest(`${endpoint}?test=${i}`));
  }

  try {
    const results = await Promise.all(promises);

    const slowRequests = results.filter(r => r.duration > 2000);
    const avgDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0) / results.length;

    console.log(`\n🎯 RESULTS:`);
    console.log(`📊 Total requests: ${results.length}`);
    console.log(`⏰ Average duration: ${Math.round(avgDuration)}ms`);
    console.log(`🐌 Slow requests (>2s): ${slowRequests.length}`);
    console.log(`🚨 Threshold: >2 slow requests in 10 minutes`);
    console.log(`✅ Should trigger: ${slowRequests.length > 2 ? 'YES' : 'MAYBE - try again if not'}`);

    if (slowRequests.length === 0) {
      console.log('\n💡 No slow requests detected. Our proxy is very fast!');
      console.log('🔄 You may need to run this test multiple times or make more concurrent requests');
    }

    console.log('\n⏰ If slow requests were generated, alert should trigger in 2-3 minutes');
    console.log('📧 Check: jrenaldi79@gmail.com');
    console.log('📊 Monitor: https://console.cloud.google.com/monitoring/alerting/policies?project=northwestern-sandbox');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

triggerHighLatency();