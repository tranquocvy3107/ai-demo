import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { ResearchData } from './entities/research-data.entity';
import { RagService } from '../rag/rag.service';
export declare class AiService {
    private configService;
    private researchDataRepo;
    private ragService;
    private readonly logger;
    private llm;
    constructor(configService: ConfigService, researchDataRepo: Repository<ResearchData>, ragService: RagService);
    generateResponse(prompt: string): Promise<string>;
    private getResearchApp;
    private extractChunkText;
    private summarizeValue;
    private formatDuration;
    private logEvent;
    streamDomainResearch(threadId: string, domain: string, prompt: string, options?: {
        tokenMode?: 'chunk' | 'char';
        signal?: AbortSignal;
    }): AsyncGenerator<{
        type: 'status';
        data: Record<string, unknown>;
    } | {
        type: 'tool';
        data: Record<string, unknown>;
    } | {
        type: 'token';
        data: Record<string, unknown>;
    } | {
        type: 'final';
        data: Record<string, unknown>;
    } | {
        type: 'error';
        data: Record<string, unknown>;
    }>;
    private getAllTools;
    startDomainResearch(threadId: string, domain: string, prompt: string, options?: {
        verbose?: boolean;
    }): Promise<{
        events?: Record<string, unknown>[] | undefined;
        message: string;
        threadId: string;
        durationMs: number;
        answer: string;
        toolsUsed: {};
    }>;
}
