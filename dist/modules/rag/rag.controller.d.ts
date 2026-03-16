import { RagService } from './rag.service';
export declare class RagController {
    private readonly ragService;
    constructor(ragService: RagService);
    create(body: {
        title: string;
        content: string;
        category: string;
        priority?: number;
        isActive?: boolean;
    }): Promise<{
        message: string;
        data: import(".").RagDocument;
    }>;
    findAll(category?: string): Promise<{
        data: import(".").RagDocument[];
        total: number;
    }>;
    findOne(id: string): Promise<{
        data: import(".").RagDocument;
    }>;
    update(id: string, body: {
        title?: string;
        content?: string;
        category?: string;
        priority?: number;
        isActive?: boolean;
    }): Promise<{
        message: string;
        data: import(".").RagDocument;
    }>;
    remove(id: string): Promise<{
        message: string;
    }>;
}
