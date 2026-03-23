import {
  StateGraph,
  START,
  END,
  MemorySaver,
  Annotation,
} from '@langchain/langgraph';
import {
  BaseMessage,
  SystemMessage,
  AIMessage,
} from '@langchain/core/messages';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOllama } from '@langchain/ollama';
import { StructuredToolInterface } from '@langchain/core/tools';
import { buildAffiliatePrompt } from '../agents/prompts.v2';
import type { AffiliateResult } from '../agents/affiliate-result.types';

const MAX_ITERATIONS = 8;

// ─── 1. STATE ─────────────────────────────────────────────────────────────────

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
  result: Annotation<AffiliateResult | null>({
    reducer: (_x, y) => y,
    default: () => null,
  }),
  // Fix #4: tracks total agent turns to prevent infinite tool-call loops
  iterationCount: Annotation<number>({
    reducer: (x, y) => x + y,
    default: () => 0,
  }),
});

export interface AffiliateGraphOptions {
  tools: StructuredToolInterface[];
}

// ─── 2. AGENT NODE ────────────────────────────────────────────────────────────

function createAgentNode(llm: ChatOllama, tools: StructuredToolInterface[]) {
  const llmWithTools = llm.bindTools(tools);

  return async (state: typeof AffiliateState.State) => {
    const { messages, goal, ragContext } = state;

    const systemPrompt = buildAffiliatePrompt({ goal, tools, ragContext });
    const inputMessages = [new SystemMessage(systemPrompt), ...messages];

    const contextChars = inputMessages
      .map((m) => m.content?.toString().length ?? 0)
      .reduce((a, b) => a + b, 0);

    console.log(`[Agent] turn=${messages.length} context_chars=${contextChars}`);

    const response = await llmWithTools.invoke(inputMessages);

    console.log(
      `[Agent] response="${response.content?.toString().slice(0, 120)}"`,
    );

    return { messages: [response], iterationCount: 1 };
  };
}

// ─── 3. ROUTER ────────────────────────────────────────────────────────────────
// tool_calls present + under iteration limit → run tools and loop back
// no tool_calls OR limit reached             → finalize

function shouldContinue(state: typeof AffiliateState.State) {
  if (state.iterationCount >= MAX_ITERATIONS) {
    console.warn(
      `[Router] Max iterations (${MAX_ITERATIONS}) reached — forcing finalize`,
    );
    return 'finalize';
  }

  const last = state.messages[state.messages.length - 1];
  const hasToolCalls =
    last.additional_kwargs?.tool_calls ||
    (last as AIMessage).tool_calls?.length;

  return hasToolCalls ? 'tools' : 'finalize';
}

// ─── 4. FINALIZE NODE ─────────────────────────────────────────────────────────
// Parses the last AI message into a typed AffiliateResult and stores it in state.

function parseAffiliateResult(content: string): AffiliateResult | null {
  try {
    // Fix #2: strip [THINKING] blocks before attempting JSON parse.
    // The prompt uses [THINKING] as a delimiter — split and take the last segment
    // which should be the final JSON answer.
    const parts = content.split('[THINKING]');
    let cleaned = parts[parts.length - 1];

    // Strip markdown code fences
    cleaned = cleaned
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    // Find the start of the JSON object in case there is any leading text
    const jsonStart = cleaned.indexOf('{');
    if (jsonStart === -1) return null;
    cleaned = cleaned.slice(jsonStart);

    const parsed = JSON.parse(cleaned);

    if (typeof parsed?.domain !== 'string') return null;

    return parsed as AffiliateResult;
  } catch {
    return null;
  }
}

function createFinalizeNode() {
  return (state: typeof AffiliateState.State) => {
    const last = state.messages[state.messages.length - 1];
    const result = parseAffiliateResult(last?.content?.toString() ?? '');

    if (!result) {
      console.warn('[Finalize] Could not parse AffiliateResult from last message');
    } else {
      console.log(`[Finalize] Parsed result domain="${result.domain}" trustScore=${result.overallTrustScore}`);
    }

    return { result };
  };
}

// ─── 5. GRAPH ─────────────────────────────────────────────────────────────────
//
//  START → agent ──(tool_calls? + under limit)──► tools → agent (loop)
//                └─(no tool_calls OR limit hit)──► finalize → END

export function createAffiliateGraph(
  llm: ChatOllama,
  options: AffiliateGraphOptions,
) {
  const { tools } = options;

  const graph = new StateGraph(AffiliateState)
    .addNode('agent', createAgentNode(llm, tools))
    .addNode('tools', new ToolNode(tools))
    .addNode('finalize', createFinalizeNode())
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', shouldContinue, {
      tools: 'tools',
      finalize: 'finalize',
    })
    .addEdge('tools', 'agent')
    .addEdge('finalize', END);

  return graph.compile({ checkpointer: new MemorySaver() });
}
