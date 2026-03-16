"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResearchState = void 0;
exports.createResearchGraph = createResearchGraph;
const langgraph_1 = require("@langchain/langgraph");
const messages_1 = require("@langchain/core/messages");
const prebuilt_1 = require("@langchain/langgraph/prebuilt");
const prompts_1 = require("../agents/prompts");
exports.ResearchState = langgraph_1.Annotation.Root({
    messages: (0, langgraph_1.Annotation)({
        reducer: (x, y) => x.concat(y),
        default: () => [],
    }),
    domain: (0, langgraph_1.Annotation)(),
    goal: (0, langgraph_1.Annotation)(),
    ragContext: (0, langgraph_1.Annotation)({
        reducer: (_x, y) => y,
        default: () => '',
    }),
});
function createResearchGraph(llm, options) {
    const { tools } = options;
    const llmWithTools = llm.bindTools(tools);
    const callModel = async (state) => {
        const { messages, domain, goal, ragContext } = state;
        let inputMessages = messages;
        if (messages.length === 1) {
            const systemPrompt = (0, prompts_1.buildSystemPrompt)({ domain, goal, ragContext });
            const systemMessage = new messages_1.SystemMessage(systemPrompt);
            inputMessages = [systemMessage, ...messages];
        }
        const response = await llmWithTools.invoke(inputMessages);
        return { messages: [response] };
    };
    const shouldContinue = (state) => {
        const { messages } = state;
        const lastMessage = messages[messages.length - 1];
        if (!lastMessage.additional_kwargs.tool_calls &&
            !lastMessage.tool_calls?.length) {
            return langgraph_1.END;
        }
        return 'tools';
    };
    const toolNode = new prebuilt_1.ToolNode(tools);
    const workflow = new langgraph_1.StateGraph(exports.ResearchState)
        .addNode('agent', callModel)
        .addNode('tools', toolNode)
        .addEdge(langgraph_1.START, 'agent')
        .addConditionalEdges('agent', shouldContinue)
        .addEdge('tools', 'agent');
    const memory = new langgraph_1.MemorySaver();
    return workflow.compile({ checkpointer: memory });
}
//# sourceMappingURL=research.graph.js.map