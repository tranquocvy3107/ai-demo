"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RagService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const rag_document_entity_1 = require("./entities/rag-document.entity");
let RagService = class RagService {
    ragRepo;
    constructor(ragRepo) {
        this.ragRepo = ragRepo;
    }
    async create(data) {
        const doc = this.ragRepo.create(data);
        return this.ragRepo.save(doc);
    }
    async findAll(category) {
        const query = this.ragRepo.createQueryBuilder('doc');
        if (category) {
            query.where('doc.category = :category', { category });
        }
        return query.orderBy('doc.priority', 'DESC').addOrderBy('doc.createdAt', 'DESC').getMany();
    }
    async findOne(id) {
        return this.ragRepo.findOne({ where: { id } });
    }
    async update(id, data) {
        const doc = await this.ragRepo.findOne({ where: { id } });
        if (!doc)
            return null;
        Object.assign(doc, data);
        return this.ragRepo.save(doc);
    }
    async remove(id) {
        const result = await this.ragRepo.delete(id);
        return (result.affected ?? 0) > 0;
    }
    async getActiveContext(category) {
        const query = this.ragRepo.createQueryBuilder('doc')
            .where('doc.isActive = :isActive', { isActive: true });
        if (category) {
            query.andWhere('doc.category = :category', { category });
        }
        const docs = await query
            .orderBy('doc.priority', 'DESC')
            .addOrderBy('doc.createdAt', 'ASC')
            .getMany();
        if (docs.length === 0)
            return '';
        return docs
            .map((doc) => `### ${doc.title} [${doc.category}]\n${doc.content}`)
            .join('\n\n---\n\n');
    }
};
exports.RagService = RagService;
exports.RagService = RagService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(rag_document_entity_1.RagDocument)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], RagService);
//# sourceMappingURL=rag.service.js.map