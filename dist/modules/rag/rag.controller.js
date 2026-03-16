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
exports.RagController = void 0;
const common_1 = require("@nestjs/common");
const rag_service_1 = require("./rag.service");
let RagController = class RagController {
    ragService;
    constructor(ragService) {
        this.ragService = ragService;
    }
    async create(body) {
        const doc = await this.ragService.create(body);
        return { message: 'Document created', data: doc };
    }
    async findAll(category) {
        const docs = await this.ragService.findAll(category);
        return { data: docs, total: docs.length };
    }
    async findOne(id) {
        const doc = await this.ragService.findOne(id);
        if (!doc)
            throw new common_1.NotFoundException('Document not found');
        return { data: doc };
    }
    async update(id, body) {
        const doc = await this.ragService.update(id, body);
        if (!doc)
            throw new common_1.NotFoundException('Document not found');
        return { message: 'Document updated', data: doc };
    }
    async remove(id) {
        const deleted = await this.ragService.remove(id);
        if (!deleted)
            throw new common_1.NotFoundException('Document not found');
        return { message: 'Document deleted' };
    }
};
exports.RagController = RagController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('category')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "findOne", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RagController.prototype, "remove", null);
exports.RagController = RagController = __decorate([
    (0, common_1.Controller)('rag/documents'),
    __metadata("design:paramtypes", [rag_service_1.RagService])
], RagController);
//# sourceMappingURL=rag.controller.js.map