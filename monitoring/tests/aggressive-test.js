#!/usr/bin/env node

/**
 * Aggressive Alert Test - Generate Many Errors Quickly
 */

const https = require('https');

const SERVICE_URL = 'https://openrouter-proxy-cjvukmm6za-uc.a.run.app';

function makeErrorRequest(path) {
  return new Promise((resolve) => {
    const url = `${SERVICE_URL}${path}`;
    console.log(`🔥 ${url}`);

    https.get(url, (res) => {
      console.log(`   ❌ ${res.statusCode}`);
      resolve({ status: res.statusCode });
    }).on('error', (err) => {
      console.log(`   💥 Error: ${err.message}`);
      resolve({ error: err.message });
    });
  });
}

async function triggerManyErrors() {
  console.log('🚨 AGGRESSIVE TEST - Generating 15 errors rapidly');
  console.log('🎯 Goal: Definitely exceed threshold of 5 errors\n');

  // Generate 15 errors very quickly
  const promises = [];
  for (let i = 1; i <= 15; i++) {
    promises.push(makeErrorRequest(`/api/v1/test-aggressive-${i}`));
  }

  try {
    console.log('🔥 Firing 15 error requests simultaneously...\n');
    const results = await Promise.all(promises);

    const errorCount = results.filter(r => r.status >= 400 || r.error).length;

    console.log(`\n🎯 RESULTS:`);
    console.log(`📊 Generated: ${errorCount} errors`);
    console.log(`🚨 Threshold: >5 errors`);
    console.log(`✅ Should trigger: ${errorCount > 5 ? 'YES' : 'NO'}`);

    console.log('\n⏰ Alert should trigger within 2-3 minutes');
    console.log('📧 Check: jrenaldi79@gmail.com');
    console.log('📊 Monitor: https://console.cloud.google.com/monitoring/alerting/policies?project=northwestern-sandbox');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

triggerManyErrors();