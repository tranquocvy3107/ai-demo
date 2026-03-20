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

// =====================
// 1. STATE
// =====================
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

// =====================
// 2. AGENT NODE (LLM)
// =====================
function createAgentNode(llm: ChatOllama, tools: StructuredToolInterface[]) {
  const llmWithTools = llm.bindTools(tools);

  return async (state: typeof AffiliateState.State) => {
    const { messages, goal, ragContext } = state;

    let inputMessages = messages;

    // inject system prompt only at first turn

    const systemPrompt = buildAffiliatePrompt({
      goal,
      tools,
      ragContext,
    });

    inputMessages = [new SystemMessage(systemPrompt), ...messages];

    // ===================== LOG MESSAGES TRƯỚC KHI INVOKE =====================
    console.log(`\n--- [Agent Node] Turn ${messages.length} ---`);
    console.log(`Messages in context: ${inputMessages.length}`);
    inputMessages.forEach((m, i) => {
      const type = m.constructor.name;
      const snippet =
        (m as BaseMessage).content?.toString().slice(0, 100) ?? '';
      console.log(`  ${i}: ${type} | snippet: "${snippet}"`);
    });
    const totalChars = inputMessages
      .map((m) => (m as BaseMessage).content?.toString().length || 0)
      .reduce((a, b) => a + b, 0);
    console.log(`Total chars in context: ${totalChars}`);

    const response = await llmWithTools.invoke(inputMessages);

    // ===================== LOG RESPONSE VÀ MESSAGES SAU TURN =====================
    console.log(
      `[Agent Node] Response type: ${response.constructor.name}, snippet: "${response.content
        ?.toString()
        .slice(0, 200)}"`,
    );
    return {
      messages: [response],
    };
  };
}

// =====================
// 3. ROUTER (DECISION)
// =====================
function shouldContinue(state: typeof AffiliateState.State) {
  const lastMessage = state.messages[state.messages.length - 1];

  const hasToolCalls =
    lastMessage.additional_kwargs?.tool_calls ||
    (lastMessage as AIMessage).tool_calls?.length;

  return hasToolCalls ? 'tools' : END;
}

// =====================
// 4. GRAPH BUILDER
// =====================
export function createAffiliateGraph(
  llm: ChatOllama,
  options: AffiliateGraphOptions,
) {
  const { tools } = options;

  // nodes
  const agentNode = createAgentNode(llm, tools);
  const toolNode = new ToolNode(tools);

  // graph
  const graph = new StateGraph(AffiliateState)
    .addNode('agent', agentNode)
    .addNode('tools', toolNode)

    // flow
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', shouldContinue)
    .addEdge('tools', 'agent');

  // memory
  const memory = new MemorySaver();

  return graph.compile({
    checkpointer: memory,
  });
}
