/**
 * Detailed chunk analyzer for balance injection
 * Shows ALL chunks received to debug balance injection
 */

const axios = require('axios');

const PROXY_URL = 'http://localhost:3000';
const API_KEY = process.env.OPENROUTER_TEST_API_KEY;

if (!API_KEY) {
  console.error('❌ OPENROUTER_TEST_API_KEY not set');
  process.exit(1);
}

async function analyzeBalanceInjection() {
  console.log('\n🔍 Detailed Balance Injection Chunk Analyzer');
  console.log('=' .repeat(80));

  try {
    const response = await axios({
      method: 'POST',
      url: `${PROXY_URL}/v1/chat/completions`,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        // Simulate ChatWise desktop client headers
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0',
      },
      data: {
        model: 'openai/gpt-3.5-turbo',
        messages: [
          { role: 'user', content: 'Say hello' }
        ],
        stream: true,
        max_tokens: 50
      },
      responseType: 'stream'
    });

    console.log(`✅ Status: ${response.status}`);
    console.log(`✅ Correlation ID: ${response.headers['x-correlation-id']}`);

    let chunkNumber = 0;
    let fullContent = '';

    response.data.on('data', (chunk) => {
      chunkNumber++;
      const chunkStr = chunk.toString();

      console.log(`\n📦 Chunk #${chunkNumber}:`);
      console.log('─'.repeat(80));
      console.log(chunkStr);
      console.log('─'.repeat(80));

      // Check for balance emoji
      if (chunkStr.includes('💰')) {
        console.log('✅ ✅ ✅ BALANCE FOUND IN THIS CHUNK! ✅ ✅ ✅');
      }

      // Try to parse as SSE
      if (chunkStr.startsWith('data: {')) {
        try {
          const jsonStr = chunkStr.substring(6).trim();
          const jsonObj = JSON.parse(jsonStr);
          const content = jsonObj.choices?.[0]?.delta?.content;
          if (content) {
            fullContent += content;
            console.log(`📝 Content in this chunk: "${content}"`);
            if (content.includes('💰')) {
              console.log('✅ ✅ ✅ BALANCE IN CONTENT! ✅ ✅ ✅');
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    });

    response.data.on('end', () => {
      console.log('\n' + '='.repeat(80));
      console.log(`✅ Stream completed after ${chunkNumber} chunks`);
      console.log(`\n📝 Full accumulated content:`);
      console.log(fullContent);

      if (fullContent.includes('💰')) {
        console.log('\n✅ ✅ ✅ SUCCESS! Balance was injected! ✅ ✅ ✅');
      } else {
        console.log('\n❌ FAILED - No balance in accumulated content');
        console.log('\n🔍 Debug tips:');
        console.log('   1. Check server logs for correlation ID:', response.headers['x-correlation-id']);
        console.log('   2. Look for "Balance injected into first chunk" message');
        console.log('   3. Check if the first content chunk was empty');
      }
    });

    await new Promise((resolve) => response.data.on('end', resolve));

  } catch (error) {
    console.error(`❌ Error:`, error.response?.data || error.message);
  }
}

analyzeBalanceInjection().catch(console.error);
