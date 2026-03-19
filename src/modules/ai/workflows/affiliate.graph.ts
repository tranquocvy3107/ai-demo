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
import { buildAffiliatePrompt } from '../agents/prompts.v2';

// State for the affiliate research agent
export const AffiliateState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  goal: Annotation<string>(),
  ragContext: Annotation<string>({
    reducer: (_x, y) => y,
    default: () => '',
  }),
});

export interface AffiliateGraphOptions {
  tools: StructuredToolInterface[];
}

export function createAffiliateGraph(
  llm: ChatOllama,
  options: AffiliateGraphOptions,
) {
  const { tools } = options;
  const llmWithTools = llm.bindTools(tools);

  const callModel = async (state: typeof AffiliateState.State) => {
    const { messages, goal, ragContext } = state;

    let inputMessages = messages;
    if (messages.length === 1) {
      const systemPrompt = buildAffiliatePrompt({ goal, tools, ragContext });
      inputMessages = [new SystemMessage(systemPrompt), ...messages];
    }

    const response = await llmWithTools.invoke(inputMessages);
    return { messages: [response] };
  };

  const shouldContinue = (state: typeof AffiliateState.State) => {
    const lastMessage = state.messages[state.messages.length - 1];

    if (
      !lastMessage.additional_kwargs.tool_calls &&
      !(lastMessage as AIMessage).tool_calls?.length
    ) {
      return END;
    }
    return 'tools';
  };

  const toolNode = new ToolNode(tools);

  const workflow = new StateGraph(AffiliateState)
    .addNode('agent', callModel)
    .addNode('tools', toolNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', shouldContinue)
    .addEdge('tools', 'agent');

  const memory = new MemorySaver();
  return workflow.compile({ checkpointer: memory });
}
