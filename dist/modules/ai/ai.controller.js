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
exports.AiController = void 0;
const common_1 = require("@nestjs/common");
const ai_service_1 = require("./ai.service");
const uuid_1 = require("uuid");
let AiController = class AiController {
    aiService;
    constructor(aiService) {
        this.aiService = aiService;
    }
    async chat(prompt) {
        if (!prompt)
            return { error: 'Prompt is required' };
        const response = await this.aiService.generateResponse(prompt);
        return { response };
    }
    async researchDomain(domain, prompt, existingThreadId, verbose) {
        if (!domain || !prompt) {
            return { error: 'Domain and prompt are required' };
        }
        const threadId = existingThreadId || (0, uuid_1.v4)();
        try {
            const result = await this.aiService.startDomainResearch(threadId, domain, prompt, { verbose: Boolean(verbose) });
            return {
                ...result,
                threadId,
            };
        }
        catch (e) {
            return { error: 'Research failed', details: e.message };
        }
    }
    async researchDomainStream(domain, prompt, existingThreadId, req, res) {
        await this.handleResearchStream(domain, prompt, existingThreadId, req, res);
    }
    async researchDomainStreamGet(domain, prompt, existingThreadId, req, res) {
        await this.handleResearchStream(domain, prompt, existingThreadId, req, res);
    }
    async handleResearchStream(domain, prompt, existingThreadId, req, res) {
        if (!domain || !prompt) {
            res.status(common_1.HttpStatus.BAD_REQUEST).json({ error: 'Domain and prompt are required' });
            return;
        }
        const threadId = existingThreadId || (0, uuid_1.v4)();
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();
        const abortController = new AbortController();
        let isClosed = false;
        req.on('close', () => {
            isClosed = true;
            abortController.abort();
        });
        const writeEvent = (event, data) => {
            res.write(`event: ${event}\n`);
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };
        writeEvent('status', { message: 'Stream connected', threadId });
        try {
            for await (const event of this.aiService.streamDomainResearch(threadId, domain, prompt, { tokenMode: 'char', signal: abortController.signal })) {
                if (isClosed)
                    break;
                writeEvent(event.type, event.data);
            }
        }
        catch (error) {
            const err = error;
            writeEvent('error', { message: err.message });
        }
        finally {
            res.end();
        }
    }
};
exports.AiController = AiController;
__decorate([
    (0, common_1.Post)('chat'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)('prompt')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "chat", null);
__decorate([
    (0, common_1.Post)('research-domain'),
    (0, common_1.HttpCode)(common_1.HttpStatus.ACCEPTED),
    __param(0, (0, common_1.Body)('domain')),
    __param(1, (0, common_1.Body)('prompt')),
    __param(2, (0, common_1.Body)('threadId')),
    __param(3, (0, common_1.Body)('verbose')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Boolean]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "researchDomain", null);
__decorate([
    (0, common_1.Post)('research-domain/stream'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)('domain')),
    __param(1, (0, common_1.Body)('prompt')),
    __param(2, (0, common_1.Body)('threadId')),
    __param(3, (0, common_1.Req)()),
    __param(4, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "researchDomainStream", null);
__decorate([
    (0, common_1.Get)('research-domain/stream'),
    __param(0, (0, common_1.Query)('domain')),
    __param(1, (0, common_1.Query)('prompt')),
    __param(2, (0, common_1.Query)('threadId')),
    __param(3, (0, common_1.Req)()),
    __param(4, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "researchDomainStreamGet", null);
exports.AiController = AiController = __decorate([
    (0, common_1.Controller)('ai'),
    __metadata("design:paramtypes", [ai_service_1.AiService])
], AiController);
//# sourceMappingURL=ai.controller.js.map