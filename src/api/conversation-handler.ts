import { IGeminiAPIClient, NormalizedChunk, GenerationConfig } from './gemini-api-interface';
import { HistoryManager } from '../history/history-manager';
import { ToolExecutor } from '../tools/tool-executor';
import { ToolCall, StreamChunk } from '../types/ui-types';

/**
 * Handles conversation flow logic for both OAuth and API Key paths
 */
export class ConversationHandler {
  constructor(
    private apiClient: IGeminiAPIClient,
    private historyManager: HistoryManager,
    private toolExecutor: ToolExecutor
  ) {}
  
  async *handleConversation(
    model: string,
    userMessage: string,
    systemPrompt: string,
    config: GenerationConfig
  ): AsyncGenerator<StreamChunk> {
    // 1. Initialize
    await this.apiClient.initialize();
    await this.apiClient.refreshTokenIfNeeded();
    
    // Note: User message will be added to history AFTER conversation completes
    // This ensures the current message isn't in history until the next message is sent
    
    // 2. First API call (include user message in API call but not in history yet)
    const historyContents = this.historyManager.serializeForAPI();
    
    // Check if the last message is already the same user message (shouldn't happen, but be safe)
    const lastMessage = historyContents[historyContents.length - 1];
    const isDuplicate = lastMessage?.role === 'user' && 
                        lastMessage?.parts?.[0]?.text === userMessage;
    
    const contentsWithUserMessage = isDuplicate
      ? historyContents  // Don't add duplicate
      : [
          ...historyContents,
          {
            role: 'user' as const,
            parts: [{ text: userMessage }]
          }
        ];
    
    let accumulatedText = '';
    let finalToolCalls: ToolCall[] = [];
    
    const { text, toolCalls } = await this.processStream(
      this.apiClient.streamGenerateContent(
        model,
        contentsWithUserMessage,
        config
      )
    );
    
    accumulatedText = text;
    finalToolCalls = toolCalls;
    
    // Yield initial response
    if (text) {
      yield { text, done: false };
    }
    
    // 3. Tool execution loop
    if (toolCalls.length > 0) {
      yield { text: '', done: false, toolCalls };
      
      let currentToolCalls = toolCalls;
      let previousModelText = accumulatedText;
      let previousModelToolCalls = toolCalls;
      
      for (let turn = 1; turn <= 10; turn++) {
        // Execute tools
        const toolResponses = await this.toolExecutor.executeToolsWithApproval(currentToolCalls);
        this.historyManager.addToolResponses(toolResponses);
        
        // Follow-up call (need to include current user message + previous model response with tool calls since they're not in history yet)
        const historyContents = this.historyManager.serializeForAPI();
        const followUpContents = [
          ...historyContents,
          {
            role: 'user' as const,
            parts: [{ text: userMessage }]
          },
          {
            role: 'model' as const,
            parts: [
              ...(previousModelText ? [{ text: previousModelText }] : []),
              ...previousModelToolCalls.map(tc => ({
                functionCall: {
                  name: tc.name,
                  args: tc.args
                }
              }))
            ]
          }
        ];
        
        const followUpResult = await this.processStream(
          this.apiClient.streamGenerateContent(
            model,
            followUpContents,
            config
          )
        );
        
        // Accumulate text from follow-up responses
        if (followUpResult.text) {
          accumulatedText += followUpResult.text;
          yield { text: followUpResult.text, done: false };
        }
        
        if (followUpResult.toolCalls.length === 0) break;
        
        // Update for next turn
        previousModelText = followUpResult.text || '';
        previousModelToolCalls = followUpResult.toolCalls;
        currentToolCalls = followUpResult.toolCalls;
        finalToolCalls = currentToolCalls;
      }
    }
    
    // 4. Add user message and model response to history AFTER conversation completes
    // This ensures the current message is only in history when the next message is sent
    this.historyManager.addUserMessage(userMessage);
    this.historyManager.addModelResponse(accumulatedText, finalToolCalls);
    
    yield { text: '', done: true };
  }
  
  private async processStream(
    stream: AsyncGenerator<NormalizedChunk>
  ): Promise<{ text: string; toolCalls: ToolCall[] }> {
    let text = '';
    const toolCalls: ToolCall[] = [];
    
    for await (const chunk of stream) {
      if (chunk.text) text += chunk.text;
      if (chunk.functionCall) {
        toolCalls.push({
          name: chunk.functionCall.name,
          args: chunk.functionCall.args,
          status: 'pending'
        });
      }
    }
    
    return { text, toolCalls };
  }
}


