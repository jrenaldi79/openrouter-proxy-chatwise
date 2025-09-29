#!/usr/bin/env node

/**
 * Test Alert Script - Generate Errors to Trigger Monitoring
 *
 * This script intentionally generates errors to test our monitoring alerts
 */

const https = require('https');

const SERVICE_URL = 'https://openrouter-proxy-cjvukmm6za-uc.a.run.app';

function makeErrorRequest(path, delay = 0) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const url = `${SERVICE_URL}${path}`;
      console.log(`🔥 Generating error: ${url}`);

      const startTime = Date.now();

      https.get(url, (res) => {
        const duration = Date.now() - startTime;
        console.log(`   ❌ Status: ${res.statusCode}, Duration: ${duration}ms`);

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({ status: res.statusCode, duration });
        });
      }).on('error', (err) => {
        console.log(`   💥 Network Error: ${err.message}`);
        resolve({ error: err.message });
      });
    }, delay);
  });
}

async function triggerErrorAlert() {
  console.log('🚨 Testing Error Rate Alert');
  console.log('⏱️  Need to generate >5 errors in 5 minutes to trigger alert');
  console.log('📧 Alert should be sent to: jrenaldi79@gmail.com\n');

  // Generate 8 errors with small delays to spread them out slightly
  const errorPaths = [
    '/api/v1/test-error-1',
    '/api/v1/test-error-2',
    '/api/v1/test-error-3',
    '/api/v1/test-error-4',
    '/api/v1/test-error-5',
    '/api/v1/test-error-6',
    '/api/v1/test-error-7',
    '/api/v1/test-error-8'
  ];

  console.log('🔥 Generating 8 error requests...\n');

  const promises = errorPaths.map((path, index) =>
    makeErrorRequest(path, index * 2000) // 2 second delays between requests
  );

  try {
    const results = await Promise.all(promises);

    const errorCount = results.filter(r => r.status >= 400 || r.error).length;

    console.log(`\n✅ Test completed!`);
    console.log(`📊 Generated ${errorCount} errors`);
    console.log(`🎯 Threshold: >5 errors in 5 minutes`);
    console.log(`⏰ Alert should trigger in 2-3 minutes if working correctly`);

    console.log('\n📧 Check your email (jrenaldi79@gmail.com) in 2-5 minutes');
    console.log('📊 Monitor in Google Cloud: https://console.cloud.google.com/monitoring?project=northwestern-sandbox');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
triggerErrorAlert();