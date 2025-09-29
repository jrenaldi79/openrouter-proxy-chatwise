#!/usr/bin/env node

/**
 * Massive Load Test - Force High Latency
 *
 * This script generates a massive number of concurrent requests
 * to overwhelm the Cloud Run instance and force slower responses
 */

const https = require('https');

const SERVICE_URL = 'https://openrouter-proxy-cjvukmm6za-uc.a.run.app';

function makeRequest(id) {
  return new Promise((resolve) => {
    const startTime = Date.now();

    https.get(`${SERVICE_URL}/api/v1/models?load-test=${id}`, (res) => {
      const duration = Date.now() - startTime;

      if (duration > 2000) {
        console.log(`🎯 SLOW: Request ${id} took ${duration}ms`);
      } else if (id % 10 === 0) {
        console.log(`⚡ Fast: Request ${id} took ${duration}ms`);
      }

      resolve({ id, duration, status: res.statusCode });
    }).on('error', (err) => {
      const duration = Date.now() - startTime;
      console.log(`❌ Error ${id}: ${err.message} (${duration}ms)`);
      resolve({ id, duration, error: err.message });
    });
  });
}

async function massiveLoadTest() {
  console.log('💥 MASSIVE LOAD TEST - Forcing High Latency');
  console.log('🎯 Goal: Overwhelm Cloud Run to create >2 second responses');
  console.log('🚀 Launching 50 concurrent requests...\n');

  // Launch 50 concurrent requests
  const promises = [];
  for (let i = 1; i <= 50; i++) {
    promises.push(makeRequest(i));
  }

  try {
    const results = await Promise.all(promises);

    const slowRequests = results.filter(r => r.duration > 2000);
    const maxDuration = Math.max(...results.map(r => r.duration));
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;

    console.log(`\n📊 MASSIVE LOAD TEST RESULTS:`);
    console.log(`🚀 Total requests: ${results.length}`);
    console.log(`⏰ Average duration: ${Math.round(avgDuration)}ms`);
    console.log(`🐌 Slowest request: ${maxDuration}ms`);
    console.log(`🎯 Slow requests (>2s): ${slowRequests.length}`);
    console.log(`🚨 Threshold: >2 slow requests`);
    console.log(`✅ Should trigger: ${slowRequests.length > 2 ? 'YES!' : 'NO - proxy too fast!'}`);

    if (slowRequests.length > 0) {
      console.log(`\n🎉 SUCCESS! Generated ${slowRequests.length} slow requests`);
      console.log('📧 High latency alert should trigger in 2-3 minutes');
    } else {
      console.log('\n🏃‍♂️ Your proxy is incredibly fast!');
      console.log('💡 Consider lowering the latency threshold in the alert policy');
      console.log('🔧 Maybe change from >2s to >1s or >500ms for testing');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

massiveLoadTest();