import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RagDocument } from './entities/rag-document.entity';

@Injectable()
export class RagService {
  constructor(
    @InjectRepository(RagDocument)
    private readonly ragRepo: Repository<RagDocument>,
  ) {}

  async create(data: Partial<RagDocument>): Promise<RagDocument> {
    const doc = this.ragRepo.create(data);
    return this.ragRepo.save(doc);
  }

  async findAll(category?: string): Promise<RagDocument[]> {
    const query = this.ragRepo.createQueryBuilder('doc');
    if (category) {
      query.where('doc.category = :category', { category });
    }
    return query.orderBy('doc.priority', 'DESC').addOrderBy('doc.createdAt', 'DESC').getMany();
  }

  async findOne(id: string): Promise<RagDocument | null> {
    return this.ragRepo.findOne({ where: { id } });
  }

  async update(id: string, data: Partial<RagDocument>): Promise<RagDocument | null> {
    const doc = await this.ragRepo.findOne({ where: { id } });
    if (!doc) return null;
    Object.assign(doc, data);
    return this.ragRepo.save(doc);
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.ragRepo.delete(id);
    return (result.affected ?? 0) > 0;
  }

  /**
   * Get all active RAG documents, optionally filtered by category.
   * These are injected into the agent's system prompt.
   */
  async getActiveContext(category?: string): Promise<string> {
    const query = this.ragRepo.createQueryBuilder('doc')
      .where('doc.isActive = :isActive', { isActive: true });

    if (category) {
      query.andWhere('doc.category = :category', { category });
    }

    const docs = await query
      .orderBy('doc.priority', 'DESC')
      .addOrderBy('doc.createdAt', 'ASC')
      .getMany();

    if (docs.length === 0) return '';

    return docs
      .map((doc) => `### ${doc.title} [${doc.category}]\n${doc.content}`)
      .join('\n\n---\n\n');
  }
}
