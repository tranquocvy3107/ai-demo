import { Repository } from 'typeorm';
import { RagDocument } from './entities/rag-document.entity';
export declare class RagService {
    private readonly ragRepo;
    constructor(ragRepo: Repository<RagDocument>);
    create(data: Partial<RagDocument>): Promise<RagDocument>;
    findAll(category?: string): Promise<RagDocument[]>;
    findOne(id: string): Promise<RagDocument | null>;
    update(id: string, data: Partial<RagDocument>): Promise<RagDocument | null>;
    remove(id: string): Promise<boolean>;
    getActiveContext(category?: string): Promise<string>;
}
