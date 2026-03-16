import { BaseMessage } from '@langchain/core/messages';
import { ChatOllama } from '@langchain/ollama';
import { StructuredToolInterface } from '@langchain/core/tools';
export declare const ResearchState: import("@langchain/langgraph").AnnotationRoot<{
    messages: import("@langchain/langgraph").BaseChannel<BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[], BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[] | import("@langchain/langgraph").OverwriteValue<BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[]>, unknown>;
    domain: import("@langchain/langgraph").LastValue<string>;
    goal: import("@langchain/langgraph").LastValue<string>;
    ragContext: import("@langchain/langgraph").BaseChannel<string, string | import("@langchain/langgraph").OverwriteValue<string>, unknown>;
}>;
export interface ResearchGraphOptions {
    tools: StructuredToolInterface[];
}
export declare function createResearchGraph(llm: ChatOllama, options: ResearchGraphOptions): import("@langchain/langgraph").CompiledStateGraph<{
    messages: BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[];
    domain: string;
    goal: string;
    ragContext: string;
}, {
    messages?: BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[] | import("@langchain/langgraph").OverwriteValue<BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[]> | undefined;
    domain?: string | undefined;
    goal?: string | undefined;
    ragContext?: string | import("@langchain/langgraph").OverwriteValue<string> | undefined;
}, "tools" | "__start__" | "agent", {
    messages: import("@langchain/langgraph").BaseChannel<BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[], BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[] | import("@langchain/langgraph").OverwriteValue<BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[]>, unknown>;
    domain: import("@langchain/langgraph").LastValue<string>;
    goal: import("@langchain/langgraph").LastValue<string>;
    ragContext: import("@langchain/langgraph").BaseChannel<string, string | import("@langchain/langgraph").OverwriteValue<string>, unknown>;
}, {
    messages: import("@langchain/langgraph").BaseChannel<BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[], BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[] | import("@langchain/langgraph").OverwriteValue<BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[]>, unknown>;
    domain: import("@langchain/langgraph").LastValue<string>;
    goal: import("@langchain/langgraph").LastValue<string>;
    ragContext: import("@langchain/langgraph").BaseChannel<string, string | import("@langchain/langgraph").OverwriteValue<string>, unknown>;
}, import("@langchain/langgraph").StateDefinition, {
    agent: {
        messages: import("@langchain/core/messages").AIMessageChunk<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>>[];
    };
    tools: any;
}, unknown, unknown>;
