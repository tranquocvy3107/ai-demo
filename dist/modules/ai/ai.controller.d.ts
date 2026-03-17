import { AiService } from './ai.service';
import type { Request, Response } from 'express';
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
    researchDomain(domain: string, prompt: string, existingThreadId?: string, verbose?: boolean): Promise<{
        error: string;
        details?: undefined;
    } | {
        threadId: string;
        events?: Record<string, unknown>[] | undefined;
        message: string;
        durationMs: number;
        answer: string;
        toolsUsed: {};
        error?: undefined;
        details?: undefined;
    } | {
        error: string;
        details: any;
    }>;
    researchDomainStream(domain: string, prompt: string, existingThreadId: string | undefined, req: Request, res: Response): Promise<void>;
    researchDomainStreamGet(domain: string, prompt: string, existingThreadId: string | undefined, req: Request, res: Response): Promise<void>;
    private handleResearchStream;
}
