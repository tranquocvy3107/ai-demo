import {
  StateGraph,
  START,
  END,
  Annotation,
} from '@langchain/langgraph';
import {
  BaseMessage,
  AIMessage,
  ToolMessage,
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

    // Speed + safety:
    // - Allow multiple tool calls per model step to reduce agent loops
    // - Still bound sensitive tools:
    //   - `domain_traffic_semrush`: at most 1 total per domain-research run
    //   - `web_scraper`: at most 1 per model step (avoid parallel scraping)
    const hasSemrushCalled = messages.some(
      (m) => m instanceof ToolMessage && m.name === 'domain_traffic_semrush',
    );

    if (response.tool_calls && response.tool_calls.length > 0) {
      let semrushKept = false;
      let scraperKept = false;

      const filteredToolCalls = response.tool_calls.filter((tc: any) => {
        const toolName = tc?.name;

        if (toolName === 'domain_traffic_semrush') {
          if (hasSemrushCalled) return false;
          if (semrushKept) return false;
          semrushKept = true;
          return true;
        }

        if (toolName === 'web_scraper') {
          if (scraperKept) return false;
          scraperKept = true;
          return true;
        }

        return true;
      });

      response.tool_calls = filteredToolCalls;

      // Do NOT suppress response.content here.
      // We want the model to be able to stream user-facing narration (e.g. `<narration>...</narration>`)
      // before/after tool calls.
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
