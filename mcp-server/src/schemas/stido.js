const { z } = require('zod');

// Base STIDO schemas
const ToolCallSchema = z.object({
  id: z.string(),
  type: z.literal('tool_call'),
  name: z.string(),
  arguments: z.record(z.any()),
  timestamp: z.string().datetime()
});

const ToolResultSchema = z.object({
  id: z.string(),
  type: z.literal('tool_result'),
  tool_call_id: z.string(),
  name: z.string(),
  content: z.any(),
  timestamp: z.string().datetime()
});

// Wrapper functions
function wrapToolCall(toolCall) {
  return {
    id: toolCall.id || crypto.randomUUID(),
    type: 'tool_call',
    name: toolCall.name,
    arguments: toolCall.arguments || {},
    timestamp: new Date().toISOString()
  };
}

function wrapToolResult(toolResult, toolCallId) {
  return {
    id: crypto.randomUUID(),
    type: 'tool_result',
    tool_call_id: toolCallId,
    name: toolResult.name,
    content: toolResult.content,
    timestamp: new Date().toISOString()
  };
}

// Validation functions
function validateToolCall(toolCall) {
  return ToolCallSchema.parse(toolCall);
}

function validateToolResult(toolResult) {
  return ToolResultSchema.parse(toolResult);
}

module.exports = {
  ToolCallSchema,
  ToolResultSchema,
  wrapToolCall,
  wrapToolResult,
  validateToolCall,
  validateToolResult
}; 