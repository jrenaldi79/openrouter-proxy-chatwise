/**
 * Test script to verify Weave tracing with multi-turn conversations
 *
 * Usage: OPENROUTER_TEST_API_KEY=your-key node dev-tests/test-weave-chat.js
 */

const apiKey = process.env.OPENROUTER_TEST_API_KEY;

if (!apiKey) {
  console.error('❌ Error: OPENROUTER_TEST_API_KEY environment variable is required');
  console.error('   Usage: OPENROUTER_TEST_API_KEY="sk-or-v1-your-key" node dev-tests/test-weave-chat.js');
  process.exit(1);
}

if (!apiKey.startsWith('sk-or-v1-')) {
  console.error('❌ Error: Invalid API key format. Must start with "sk-or-v1-"');
  process.exit(1);
}

async function sendChatMessage(messages) {
  const response = await fetch('http://localhost:3000/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek/deepseek-chat',
      messages: messages,
      max_tokens: 100,
      temperature: 0.7
    })
  });

  const data = await response.json();
  return data;
}

async function testMultiTurnConversation() {
  console.log('Testing multi-turn conversation with Weave tracing...\n');

  // Conversation history - START WITH SYSTEM PROMPT
  const conversation = [
    {
      role: 'system',
      content: 'You are a helpful assistant named Bob who is friendly and remembers details about the conversation.'
    }
  ];

  // Turn 1: Initial greeting
  console.log('=== Turn 1: Initial greeting (with system prompt) ===');
  conversation.push({ role: 'user', content: 'Hello! My name is Alice. What\'s your name?' });
  let response = await sendChatMessage(conversation);
  let assistantMessage = response.choices[0].message.content;
  conversation.push({ role: 'assistant', content: assistantMessage });
  console.log('User: Hello! My name is Alice. What\'s your name?');
  console.log('Assistant:', assistantMessage);
  console.log();

  // Wait a bit between messages
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Turn 2: Ask a question
  console.log('=== Turn 2: Ask a question ===');
  conversation.push({ role: 'user', content: 'Can you remember my name? And what\'s your favorite color?' });
  response = await sendChatMessage(conversation);
  assistantMessage = response.choices[0].message.content;
  conversation.push({ role: 'assistant', content: assistantMessage });
  console.log('User: Can you remember my name? And what\'s your favorite color?');
  console.log('Assistant:', assistantMessage);
  console.log();

  // Wait a bit between messages
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Turn 3: Follow-up question
  console.log('=== Turn 3: Follow-up question ===');
  conversation.push({ role: 'user', content: 'That\'s interesting! Can you explain why you like that color?' });
  response = await sendChatMessage(conversation);
  assistantMessage = response.choices[0].message.content;
  conversation.push({ role: 'assistant', content: assistantMessage });
  console.log('User: That\'s interesting! Can you explain why you like that color?');
  console.log('Assistant:', assistantMessage);
  console.log();

  console.log('✅ Multi-turn conversation test completed!');
  console.log(`Final conversation length: ${conversation.length} messages`);
  console.log('\nNote: The conversation started with a system prompt defining the assistant as "Bob"');
}

testMultiTurnConversation().catch(console.error);
