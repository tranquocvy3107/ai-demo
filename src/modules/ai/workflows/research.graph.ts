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
import { ChatOllama } from '@langchain/ollama';
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
  llm: ChatOllama,
  options: ResearchGraphOptions,
) {
  const { tools } = options;
  const llmWithTools = llm.bindTools(tools);

  const callModel = async (state: typeof ResearchState.State) => {
    const { messages } = state;
    const response = await llmWithTools.invoke(messages);
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
