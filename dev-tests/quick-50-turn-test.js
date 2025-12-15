const axios = require('axios');

const messages = [{ role: 'system', content: 'You are helpful.' }];
for (let i = 1; i <= 50; i++) {
  messages.push({ role: 'user', content: `Message ${i}. Please explain in detail.` });
  if (i < 50) {
    messages.push({ role: 'assistant', content: `Response ${i}. Detailed explanation with multiple paragraphs.` });
  }
}

console.log('\n🧪 Testing 50-turn conversation (100 messages)\n');
console.log('Check server logs for "Context warning check" debug output\n');

axios.post('http://localhost:3000/v1/chat/completions', {
  model: 'openai/gpt-3.5-turbo',
  messages,
  stream: true,
  max_tokens: 20,
}, {
  headers: {
    'Authorization': `Bearer ${process.env.OPENROUTER_TEST_API_KEY || 'sk-or-v1-your-test-key-here'}`,
    'Content-Type': 'application/json',
  },
  responseType: 'stream',
}).then(response => {
  response.data.on('end', () => {
    console.log('✅ Request complete - check server logs for debug output');
    setTimeout(() => process.exit(0), 1000);
  });
  response.data.on('error', (e) => {
    console.error('❌', e);
    process.exit(1);
  });
}).catch(e => {
  console.error('❌', e.message);
  process.exit(1);
});
