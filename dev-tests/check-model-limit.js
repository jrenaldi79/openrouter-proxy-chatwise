/**
 * Check what model limit is being used for a specific model
 */

const axios = require('axios');

const PROXY_URL = 'http://localhost:3000';
const API_KEY = process.env.OPENROUTER_TEST_API_KEY || 'sk-or-v1-your-test-key-here';

async function checkModelLimit() {
  console.log('\n🔍 Checking Model Limit Configuration\n');
  console.log('='.repeat(80));

  // Import the model limits module directly
  const path = require('path');
  const projectRoot = path.join(__dirname, '..');

  // We need to check what limit is returned by getModelLimits()
  // Let's make a request and check the server logs

  const model = 'openai/gpt-3.5-turbo';

  try {
    console.log(`\n📊 Testing model: ${model}\n`);

    // Make a simple request
    const response = await axios.post(
      `${PROXY_URL}/v1/chat/completions`,
      {
        model: model,
        messages: [
          { role: 'user', content: 'Hello' }
        ],
        max_tokens: 10,
      },
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ Request successful');
    console.log(`Usage: ${JSON.stringify(response.data.usage, null, 2)}`);

    console.log('\n📝 Check server logs for model limit details');
    console.log('   Look for logs containing "model limit" or "context warning"');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n💡 To see what limit is being used:');
  console.log('   1. Check if modelDataService has data for this model');
  console.log('   2. If yes, it uses per_request_limits.prompt_tokens');
  console.log('   3. If no, it falls back to hard-coded limits (16k for gpt-3.5-turbo)');
  console.log('');
}

checkModelLimit().catch(console.error);
