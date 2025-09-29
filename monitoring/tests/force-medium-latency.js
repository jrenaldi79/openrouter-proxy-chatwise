#!/usr/bin/env node

/**
 * Force Medium Latency Data Generation
 *
 * Generate many requests over multiple rounds to ensure the medium latency metric gets data
 */

const https = require('https');

const SERVICE_URL = 'https://openrouter-proxy-cjvukmm6za-uc.a.run.app';

function makeRequest(id, round) {
  return new Promise((resolve) => {
    const startTime = Date.now();

    https.get(`${SERVICE_URL}/api/v1/models?round=${round}&id=${id}`, (res) => {
      const duration = Date.now() - startTime;

      if (duration > 500) {
        console.log(`✅ Round ${round}, Request ${id}: ${duration}ms (>500ms - should count!)`);
      }

      resolve({ id, round, duration, status: res.statusCode });
    }).on('error', (err) => {
      const duration = Date.now() - startTime;
      resolve({ id, round, duration, error: err.message });
    });
  });
}

async function generateMediumLatencyData() {
  console.log('🎯 FORCING MEDIUM LATENCY DATA GENERATION');
  console.log('📊 Goal: Generate enough >500ms requests to populate the metric');
  console.log('🔄 Running multiple rounds with delays...\n');

  // Run 3 rounds of 30 requests each with delays between rounds
  for (let round = 1; round <= 3; round++) {
    console.log(`🚀 Round ${round}: Launching 30 concurrent requests...`);

    const promises = [];
    for (let i = 1; i <= 30; i++) {
      promises.push(makeRequest(i, round));
    }

    const results = await Promise.all(promises);
    const slowRequests = results.filter(r => r.duration > 500);
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;

    console.log(`   📊 Round ${round} results: ${slowRequests.length}/30 requests >500ms, avg: ${Math.round(avgDuration)}ms`);

    if (round < 3) {
      console.log('   ⏰ Waiting 30 seconds before next round...\n');
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }

  console.log('\n🎉 Data generation complete!');
  console.log('⏰ Wait 3-5 minutes for Google Cloud to process the data');
  console.log('🔍 Then check the metric selector again for: openrouter_proxy_medium_latency');
}

generateMediumLatencyData();