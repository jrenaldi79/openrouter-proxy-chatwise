/**
 * Manual test script for Langfuse observability integration
 *
 * This script tests the Langfuse tracing functionality by sending chat completion
 * requests to the local development server and verifying that traces appear in
 * the Langfuse dashboard.
 *
 * Prerequisites:
 * 1. Dev server running: npm run dev
 * 2. Langfuse environment variables configured in .env:
 *    - LANGFUSE_PUBLIC_KEY
 *    - LANGFUSE_SECRET_KEY
 *    - LANGFUSE_BASE_URL (optional, defaults to cloud.langfuse.com)
 *
 * Usage:
 *   node dev-tests/test-langfuse-chat.js
 *
 * Expected behavior:
 * - Creates 3 traces in Langfuse with growing message histories
 * - Traces should show all messages including system prompts
 * - Traces should capture input parameters, output, and token usage
 */

const API_BASE_URL = 'http://localhost:3000';

async function sendChatMessage(messages) {
  const response = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_TEST_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek/deepseek-chat',
      messages: messages,
      temperature: 0,
      max_tokens: 100,
    }),
  });

  const data = await response.json();
  console.log('API Response:', JSON.stringify(data, null, 2));
  return data;
}

async function testMultiTurnConversation() {
  console.log('Testing multi-turn conversation with Langfuse tracing...\n');

  // Conversation history - START WITH SYSTEM PROMPT
  const conversation = [
    {
      role: 'system',
      content: 'You are a helpful assistant named Charlie who is friendly and remembers details about the conversation.'
    }
  ];

  // Turn 1: Initial greeting
  console.log('=== Turn 1: Initial greeting (with system prompt) ===');
  conversation.push({ role: 'user', content: 'Hello! My name is Bob. What\'s your name?' });
  let response = await sendChatMessage(conversation);
  let assistantMessage = response.choices[0].message.content;
  conversation.push({ role: 'assistant', content: assistantMessage });
  console.log('User: Hello! My name is Bob. What\'s your name?');
  console.log('Assistant:', assistantMessage);
  console.log();

  // Wait a bit between requests to avoid rate limiting
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Turn 2: Ask a question (with 4 messages in history: 1 system + 1 user + 1 assistant + 1 user)
  console.log('=== Turn 2: Ask a question ===');
  conversation.push({ role: 'user', content: 'Can you remember my name? And what do you like to do?' });
  response = await sendChatMessage(conversation);
  assistantMessage = response.choices[0].message.content;
  conversation.push({ role: 'assistant', content: assistantMessage });
  console.log('User: Can you remember my name? And what do you like to do?');
  console.log('Assistant:', assistantMessage);
  console.log();

  // Wait a bit between requests
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Turn 3: Follow-up question (with 6 messages in history)
  console.log('=== Turn 3: Follow-up question ===');
  conversation.push({ role: 'user', content: 'That\'s interesting! Can you tell me more about that?' });
  response = await sendChatMessage(conversation);
  assistantMessage = response.choices[0].message.content;
  conversation.push({ role: 'assistant', content: assistantMessage });
  console.log('User: That\'s interesting! Can you tell me more about that?');
  console.log('Assistant:', assistantMessage);
  console.log();

  console.log('✅ Multi-turn conversation test completed!');
  console.log(`Final conversation length: ${conversation.length} messages`);
  console.log('\nNote: The conversation started with a system prompt defining the assistant as "Charlie"');
  console.log('\nCheck your Langfuse dashboard for the traces:');
  console.log('- Turn 1 should have 2 messages (1 system + 1 user)');
  console.log('- Turn 2 should have 4 messages (full history)');
  console.log('- Turn 3 should have 6 messages (full history)');
}

testMultiTurnConversation().catch(console.error);
