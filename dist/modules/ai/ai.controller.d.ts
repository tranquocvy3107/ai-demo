import { AiService } from './ai.service';
export declare class AiController {
    private readonly aiService;
    constructor(aiService: AiService);
    chat(prompt: string): Promise<{
        error: string;
        response?: undefined;
    } | {
        response: string;
        error?: undefined;
    }>;
    researchDomain(domain: string, prompt: string, existingThreadId?: string): Promise<{
        error: string;
        message?: undefined;
        threadId?: undefined;
        stepsReceived?: undefined;
        data?: undefined;
        details?: undefined;
    } | {
        message: string;
        threadId: string;
        stepsReceived: number;
        data: {
            agent?: {
                messages: import("@langchain/core/messages").AIMessageChunk<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>>[];
            } | undefined;
            tools?: any;
        }[];
        error?: undefined;
        details?: undefined;
    } | {
        error: string;
        details: any;
        message?: undefined;
        threadId?: undefined;
        stepsReceived?: undefined;
        data?: undefined;
    }>;
}
