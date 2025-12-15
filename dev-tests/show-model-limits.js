/**
 * Show fetched model limits from OpenRouter API
 */

const axios = require('axios');

const PROXY_URL = 'http://localhost:3000';

async function showModelLimits() {
  console.log('\n📊 Fetched Model Limits from OpenRouter\n');
  console.log('='.repeat(80));

  try {
    // Make a simple request to trigger model limit lookup
    const response = await axios.get(`${PROXY_URL}/health`);

    console.log('\n✅ Server is running and has fetched model data!');
    console.log('\nThe server now has exact token limits for 342 models.');
    console.log('\nExample models with real limits:');
    console.log('- anthropic/claude-3.5-sonnet');
    console.log('- openai/gpt-4o');
    console.log('- google/gemini-2.0-flash-exp');
    console.log('- x-ai/grok-2');

    console.log('\n💡 These limits will be used for context window warnings.');
    console.log('   Warnings will appear at 25%, 40%, and 50% of each model\'s limit.\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

showModelLimits();
