import { ChatOpenAI } from '@langchain/openai';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  BaseMessage,
  AIMessageChunk,
} from '@langchain/core/messages';
import {
  PromptTemplate,
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { DynamicTool } from '@langchain/core/tools';
import { Message as VercelChatMessage } from 'ai';
import { z } from 'zod';

// Verify environment variable
const apiKey = process.env.OPENAI_API_KEY;
console.log('API Key available:', !!apiKey);

if (!apiKey) {
  throw new Error('Missing OpenAI API Key');
}

// -- LangChain Tool Definition --
// Simplify tool definition: remove schema, func takes string
const lookupUserTool = new DynamicTool({
  name: 'lookupUser',
  description:
    'Look up user name using their Singapore phone number (e.g., 93663631). Use ONLY when user provides phone number.',
  func: async (inputString: string): Promise<string> => {
    // Input string *might* be just the phone number if model extracts it,
    // or it might be JSON if model uses schema implicitly. Add basic check.
    let phoneNumber = '';
    try {
      const potentialJson = JSON.parse(inputString);
      if (typeof potentialJson === 'object' && potentialJson !== null && 'phoneNumber' in potentialJson) {
         phoneNumber = String(potentialJson.phoneNumber);
      } else {
          // Assume input string *is* the phone number if not JSON object
          phoneNumber = inputString.replace(/\D/g, ''); // Extract digits
      }
    } catch (e) {
        // Assume input string *is* the phone number if JSON parse fails
        phoneNumber = inputString.replace(/\D/g, ''); // Extract digits
    }

    console.log(`📞 [LangChain Tool Simplified] Looking up user by phone: ${phoneNumber}`);
    if (phoneNumber === '93663631') {
      return 'Raymond Ho';
    } else {
      return 'Could not find user.';
    }
  },
});

// Helper to convert Vercel messages to LangChain messages
const convertVercelMessagesToLangChain = (
  messages: VercelChatMessage[],
): BaseMessage[] => {
  return messages
    .map((message) => {
      if (message.role === 'user') {
        return new HumanMessage(message.content);
      } else if (message.role === 'assistant') {
        // Handle potential tool calls encoded in assistant messages if needed later
        return new AIMessage(message.content);
      } else if (message.role === 'system') {
        return new SystemMessage(message.content);
      }
      // Ignore 'data' or other roles for now
      return null;
    })
    .filter((msg): msg is BaseMessage => msg !== null);
};

// System Prompt - Simplified but keeps tool instruction
const SYSTEM_TEMPLATE = `You are a helpful beauty advisor for Rare Beauty.
**VERY IMPORTANT INSTRUCTION:** When the user provides their phone number, you MUST use the lookupUser tool. The tool will return the user's name as a string. You MUST then respond EXACTLY with: "Hello [Name returned by tool]! How can I help you today?" replacing [Name returned by tool] with the actual name. Do not say anything else before or after this exact sentence in that specific response.
For other requests, be friendly and provide helpful advice about Rare Beauty products.`;

export async function POST(req: Request) {
  try {
    console.log('Received chat request (LangChain focus)');
    const { messages }: { messages: VercelChatMessage[] } = await req.json();
    console.log('Vercel Messages received:', messages);

    if (!messages || messages.length === 0) {
      console.log('No messages provided');
      return new Response('No messages provided', { status: 400 });
    }

    const langChainMessages = convertVercelMessagesToLangChain(messages);
    console.log('LangChain Messages:', langChainMessages);

    // Define Model and bind tool
    const model = new ChatOpenAI({
      modelName: 'gpt-3.5-turbo',
      openAIApiKey: apiKey,
      temperature: 0.7,
      streaming: true, // Important for LangChain streaming
    });

    // Bind the tool to the model. LangChain handles when to call it.
    const modelWithTools = model.bindTools([lookupUserTool]);

    // Create prompt template
    // Use MessagesPlaceholder to handle the history correctly
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', SYSTEM_TEMPLATE],
      new MessagesPlaceholder('chat_history'), // LangChain expects this variable name
    ]);

    // Create the Runnable Chain *without* the final StringOutputParser
    const chain = RunnableSequence.from([
      (input: { chat_history: BaseMessage[] }) => input,
      prompt,
      modelWithTools, // Output should be AIMessageChunk stream
    ]);

    // Re-add StringOutputParser to the chain
    const chainWithParser = RunnableSequence.from([
      (input: { chat_history: BaseMessage[] }) => input,
      prompt,
      modelWithTools,
      new StringOutputParser(), // Re-added
    ]);

    console.log('Invoking LangChain chain (output: string stream)');
    // Invoke the chain, now expecting a string stream
    const stream = await chainWithParser.stream({
      chat_history: langChainMessages,
    }); // Should be ReadableStream<string>

    console.log('Returning standard Response with LangChain stream');
    // Return standard streaming Response, bypassing Vercel adapter
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8', // Use text/plain for simple string stream
        'Transfer-Encoding': 'chunked',
      },
    });

  } catch (error) {
    console.error('Error in LangChain chat route:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error('Detailed error:', errorMessage);
    // Keep previous error response structure
    return new Response(
      JSON.stringify({
        error: 'Error processing chat request',
        details: errorMessage,
        cause:
          error instanceof Error && 'cause' in error ? error.cause : undefined,
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
  }
} 