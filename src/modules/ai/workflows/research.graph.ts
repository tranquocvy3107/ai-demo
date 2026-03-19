import {
  StateGraph,
  START,
  END,
  MemorySaver,
  Annotation,
} from '@langchain/langgraph';
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
  AIMessage,
} from '@langchain/core/messages';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOllama } from '@langchain/ollama';
import { StructuredToolInterface } from '@langchain/core/tools';
import { buildSystemPrompt } from '../agents/prompts';

// 1. Define the State
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

  // Bind tools to the LLM
  const llmWithTools = llm.bindTools(tools);

  // 2. Define the Agent Node
  const callModel = async (state: typeof ResearchState.State) => {
    const { messages, domain, goal, ragContext } = state;

    // System prompt is now injected at the start in AiService
    const inputMessages = messages;

    const response = await llmWithTools.invoke(inputMessages);
    return { messages: [response] };
  };

  // 3. Define the conditional edge for routing
  const shouldContinue = (state: typeof ResearchState.State) => {
    const { messages } = state;
    const lastMessage = messages[messages.length - 1];

    // If there are no tool calls, the LLM has finished reasoning
    if (
      !lastMessage.additional_kwargs.tool_calls &&
      !(lastMessage as AIMessage).tool_calls?.length
    ) {
      return END;
    }
    // Otherwise, route to tools
    return 'tools';
  };

  const toolNode = new ToolNode(tools);

  // 4. Construct the Graph
  const workflow = new StateGraph(ResearchState)
    .addNode('agent', callModel)
    .addNode('tools', toolNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', shouldContinue)
    .addEdge('tools', 'agent');

  // We use MemorySaver to persist state across thread calls
  const memory = new MemorySaver();
  return workflow.compile({ checkpointer: memory });
}
