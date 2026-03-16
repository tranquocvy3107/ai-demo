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
var AiService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const ollama_1 = require("@langchain/ollama");
const research_graph_1 = require("./workflows/research.graph");
const messages_1 = require("@langchain/core/messages");
const tools_1 = require("./tools");
const save_data_tool_1 = require("./tools/save-data.tool");
const read_data_tool_1 = require("./tools/read-data.tool");
const research_data_entity_1 = require("./entities/research-data.entity");
const rag_service_1 = require("../rag/rag.service");
let AiService = AiService_1 = class AiService {
    configService;
    researchDataRepo;
    ragService;
    logger = new common_1.Logger(AiService_1.name);
    llm;
    constructor(configService, researchDataRepo, ragService) {
        this.configService = configService;
        this.researchDataRepo = researchDataRepo;
        this.ragService = ragService;
        const baseUrl = this.configService.get('ai.ollamaBaseUrl');
        this.llm = new ollama_1.ChatOllama({
            baseUrl,
            model: 'qwen2.5:7b',
            temperature: 0,
        });
    }
    async generateResponse(prompt) {
        const response = await this.llm.invoke(prompt);
        return response.content;
    }
    getAllTools() {
        const saveDataTool = (0, save_data_tool_1.createSaveDataTool)(this.researchDataRepo);
        const readDataTool = (0, read_data_tool_1.createReadDataTool)(this.researchDataRepo);
        return [...tools_1.staticTools, saveDataTool, readDataTool];
    }
    async startDomainResearch(threadId, domain, prompt) {
        this.logger.log(`Starting research for ${domain} with thread ${threadId}`);
        const ragContext = await this.ragService.getActiveContext();
        this.logger.debug(`RAG context loaded: ${ragContext.length} chars`);
        const tools = this.getAllTools();
        const researchApp = (0, research_graph_1.createResearchGraph)(this.llm, { tools });
        const initialState = {
            messages: [new messages_1.HumanMessage(prompt)],
            domain,
            goal: prompt,
            ragContext,
        };
        const stream = await researchApp.stream(initialState, {
            configurable: { thread_id: threadId },
        });
        const steps = [];
        for await (const chunk of stream) {
            this.logger.debug(JSON.stringify(chunk));
            steps.push(chunk);
        }
        return steps;
    }
};
exports.AiService = AiService;
exports.AiService = AiService = AiService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, typeorm_1.InjectRepository)(research_data_entity_1.ResearchData)),
    __metadata("design:paramtypes", [config_1.ConfigService,
        typeorm_2.Repository,
        rag_service_1.RagService])
], AiService);
//# sourceMappingURL=ai.service.js.map