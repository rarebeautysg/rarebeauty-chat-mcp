import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { StructuredTool, DynamicStructuredTool } from "@langchain/core/tools";

// More flexible type for tools
type AnyTool = StructuredTool | DynamicStructuredTool<any, any, any> | any;

type ExecutorOptions = {
  model: BaseChatModel;
  systemPrompt: SystemMessage;
  tools: AnyTool[];
};

type InvokeOptions = {
  input: string;
  chat_history?: Array<{ type: string; content: string }>;
};

export class Executor {
  private model: BaseChatModel;
  private systemPrompt: SystemMessage;
  private tools: AnyTool[];
  private memory: Record<string, any> = {};

  constructor(options: ExecutorOptions) {
    this.model = options.model;
    this.systemPrompt = options.systemPrompt;
    this.tools = options.tools;
  }

  async invoke(options: InvokeOptions): Promise<{ output: string; memory?: Record<string, any> }> {
    const { input, chat_history = [] } = options;
    
    try {
      // Convert chat history to message format
      const messages = [
        this.systemPrompt,
        ...chat_history.map(msg => {
          if (msg.type === 'user') {
            return new HumanMessage(msg.content);
          } else {
            return new AIMessage(msg.content);
          }
        }),
        new HumanMessage(input)
      ];
      
      // Call the model
      const response = await this.model.invoke(messages);
      
      // Extract user context if present in the response
      // Check for patterns like "User Context: {...}" or similar
      // Use a more compatible regex without the 's' flag
      const responseText = response.content.toString();
      const userContextMatch = responseText.match(/User Context:\s*({[^}]*})/);
      if (userContextMatch && userContextMatch[1]) {
        try {
          const contextJson = userContextMatch[1].replace(/'/g, '"');
          const userContext = JSON.parse(contextJson);
          this.memory.userContext = userContext;
        } catch (e) {
          console.error('Failed to parse user context from response:', e);
        }
      }
      
      return {
        output: responseText,
        memory: this.memory
      };
    } catch (error) {
      console.error('Error in executor invoke:', error);
      throw error;
    }
  }
  
  // Method to use a specific tool
  async useTool(toolName: string, params: Record<string, any>): Promise<any> {
    const tool = this.tools.find(t => t.name === toolName);
    
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }
    
    try {
      return await tool.invoke(params);
    } catch (error) {
      console.error(`Error using tool ${toolName}:`, error);
      throw error;
    }
  }
  
  // Access the memory
  getMemory(): Record<string, any> {
    return this.memory;
  }
  
  // Update the memory
  updateMemory(key: string, value: any): void {
    this.memory[key] = value;
  }
} 