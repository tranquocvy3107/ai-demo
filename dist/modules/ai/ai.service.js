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
    getResearchApp() {
        const tools = this.getAllTools();
        return (0, research_graph_1.createResearchGraph)(this.llm, { tools });
    }
    extractChunkText(chunk) {
        if (!chunk)
            return '';
        if (typeof chunk === 'string')
            return chunk;
        if (typeof chunk === 'object' && chunk !== null) {
            const typedChunk = chunk;
            if (typeof typedChunk.content === 'string')
                return typedChunk.content;
            if (Array.isArray(typedChunk.content)) {
                return typedChunk.content
                    .map((item) => {
                    if (typeof item === 'string')
                        return item;
                    if (item && typeof item === 'object') {
                        const typedItem = item;
                        if (typeof typedItem.text === 'string')
                            return typedItem.text;
                        if (typeof typedItem.content === 'string')
                            return typedItem.content;
                    }
                    return '';
                })
                    .join('');
            }
            if (typeof typedChunk.text === 'string')
                return typedChunk.text;
        }
        return '';
    }
    summarizeValue(value, maxLength = 300) {
        if (value === null || value === undefined)
            return '';
        let text;
        if (typeof value === 'string') {
            text = value;
        }
        else {
            try {
                text = JSON.stringify(value);
            }
            catch {
                text = String(value);
            }
        }
        if (text.length <= maxLength)
            return text;
        return `${text.slice(0, maxLength)}...`;
    }
    formatDuration(ms) {
        if (ms < 1000)
            return `${ms}ms`;
        const seconds = Math.round(ms / 100) / 10;
        return `${seconds}s`;
    }
    logEvent(threadId, message) {
        this.logger.log(`[Research:${threadId}] ${message}`);
    }
    async *streamDomainResearch(threadId, domain, prompt, options) {
        const tokenMode = options?.tokenMode ?? 'char';
        const startedAt = Date.now();
        this.logEvent(threadId, `Start research for ${domain}`);
        const ragContext = await this.ragService.getActiveContext();
        yield {
            type: 'status',
            data: {
                message: 'RAG context loaded',
                ragChars: ragContext.length,
            },
        };
        const researchApp = this.getResearchApp();
        const initialState = {
            messages: [new messages_1.HumanMessage(prompt)],
            domain,
            goal: prompt,
            ragContext,
        };
        const toolStats = {};
        let finalAnswer = '';
        try {
            const eventStream = researchApp.streamEvents(initialState, {
                configurable: { thread_id: threadId },
                signal: options?.signal,
                version: 'v2',
            });
            for await (const event of eventStream) {
                const streamEvent = event;
                const eventName = streamEvent.event;
                if (eventName === 'on_tool_start') {
                    const toolName = streamEvent.name || 'unknown';
                    toolStats[toolName] = (toolStats[toolName] ?? 0) + 1;
                    this.logEvent(threadId, `Tool start: ${toolName}`);
                    yield {
                        type: 'tool',
                        data: {
                            phase: 'start',
                            tool: toolName,
                            input: this.summarizeValue(streamEvent.data?.input),
                        },
                    };
                    continue;
                }
                if (eventName === 'on_tool_end') {
                    const toolName = streamEvent.name || 'unknown';
                    this.logEvent(threadId, `Tool end: ${toolName}`);
                    yield {
                        type: 'tool',
                        data: {
                            phase: 'end',
                            tool: toolName,
                            output: this.summarizeValue(streamEvent.data?.output),
                        },
                    };
                    continue;
                }
                if (eventName === 'on_chat_model_stream' || eventName === 'on_llm_stream') {
                    const chunkText = this.extractChunkText(streamEvent.data?.chunk);
                    if (!chunkText)
                        continue;
                    finalAnswer += chunkText;
                    if (tokenMode === 'char') {
                        for (const char of chunkText) {
                            yield { type: 'token', data: { value: char } };
                        }
                    }
                    else {
                        yield { type: 'token', data: { value: chunkText } };
                    }
                    continue;
                }
            }
            const durationMs = Date.now() - startedAt;
            this.logEvent(threadId, `Completed in ${this.formatDuration(durationMs)}`);
            yield {
                type: 'final',
                data: {
                    message: 'Research complete',
                    threadId,
                    durationMs,
                    toolsUsed: Object.entries(toolStats).map(([tool, count]) => ({
                        tool,
                        count,
                    })),
                    answer: finalAnswer.trim(),
                },
            };
        }
        catch (error) {
            if (options?.signal?.aborted) {
                this.logEvent(threadId, 'Stream aborted by client');
                return;
            }
            const err = error;
            this.logEvent(threadId, `Failed: ${err.message}`);
            yield { type: 'error', data: { message: err.message } };
        }
    }
    getAllTools() {
        const saveDataTool = (0, save_data_tool_1.createSaveDataTool)(this.researchDataRepo);
        const readDataTool = (0, read_data_tool_1.createReadDataTool)(this.researchDataRepo);
        return [...tools_1.staticTools, saveDataTool, readDataTool];
    }
    async startDomainResearch(threadId, domain, prompt, options) {
        const startedAt = Date.now();
        const verbose = options?.verbose ?? false;
        const events = [];
        let answer = '';
        let finalMeta = {};
        for await (const event of this.streamDomainResearch(threadId, domain, prompt, { tokenMode: 'chunk' })) {
            if (event.type === 'token') {
                answer += String(event.data.value ?? '');
            }
            else if (event.type === 'final') {
                finalMeta = event.data;
            }
            if (verbose) {
                events.push(event);
            }
        }
        const durationMs = Date.now() - startedAt;
        return {
            message: 'Research complete',
            threadId,
            durationMs,
            answer: answer.trim(),
            toolsUsed: finalMeta.toolsUsed ?? [],
            ...(verbose ? { events } : {}),
        };
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