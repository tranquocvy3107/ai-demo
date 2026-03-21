import {
  StateGraph,
  START,
  END,
  Annotation,
} from '@langchain/langgraph';
import {
  BaseMessage,
  AIMessage,
} from '@langchain/core/messages';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { StructuredToolInterface } from '@langchain/core/tools';

export const ResearchState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  domain: Annotation<string>(),
  goal: Annotation<string>(),
  ragContext: Annotation<string>({
    reducer: (_x, y) => y,
    default: () => '',
  }),
});

export interface ResearchGraphOptions {
  tools: StructuredToolInterface[];
}

export function createResearchGraph(
  llm: BaseChatModel,
  options: ResearchGraphOptions,
) {
  const { tools } = options;
  if (!llm.bindTools) {
    throw new Error('LLM does not support tool binding. Please use a chat model that supports tools.');
  }
  const llmWithTools = llm.bindTools(tools);

  const callModel = async (state: typeof ResearchState.State, config: any) => {
    const { messages } = state;
    const response = await llmWithTools.invoke(messages, config);

    // Keep tool execution flexible for performance, but prevent duplicated scrapers in one turn.
    if (response.tool_calls && response.tool_calls.length > 1) {
      const filteredCalls = response.tool_calls.filter((call, index, list) => {
        if (call.name !== 'web_scraper') {
          return true;
        }
        return list.findIndex((item) => item.name === 'web_scraper') === index;
      });

      // Hard-limit tool calls in a single turn to avoid runaway latency.
      response.tool_calls = filteredCalls.slice(0, 4);
    }

    return { messages: [response] };
  };

  const shouldContinue = (state: typeof ResearchState.State) => {
    const { messages } = state;
    const lastMessage = messages[messages.length - 1] as AIMessage;
    if (!lastMessage.additional_kwargs.tool_calls && !lastMessage.tool_calls?.length) {
      return END;
    }
    return 'tools';
  };

  const toolNode = new ToolNode(tools);

  // We intentionally remove MemorySaver checkpointer here.
  // Instead, the AI memory is handled as a summary step in AiService using AgentMemory entity.
  // This prevents context-overflow problems when processing long and complicated tasks.
  const workflow = new StateGraph(ResearchState)
    .addNode('agent', callModel)
    .addNode('tools', toolNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', shouldContinue)
    .addEdge('tools', 'agent');

  return workflow.compile();
}
