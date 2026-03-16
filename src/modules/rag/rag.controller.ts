import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { RagService } from './rag.service';

@Controller('rag/documents')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body()
    body: {
      title: string;
      content: string;
      category: string;
      priority?: number;
      isActive?: boolean;
    },
  ) {
    const doc = await this.ragService.create(body);
    return { message: 'Document created', data: doc };
  }

  @Get()
  async findAll(@Query('category') category?: string) {
    const docs = await this.ragService.findAll(category);
    return { data: docs, total: docs.length };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const doc = await this.ragService.findOne(id);
    if (!doc) throw new NotFoundException('Document not found');
    return { data: doc };
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      content?: string;
      category?: string;
      priority?: number;
      isActive?: boolean;
    },
  ) {
    const doc = await this.ragService.update(id, body);
    if (!doc) throw new NotFoundException('Document not found');
    return { message: 'Document updated', data: doc };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    const deleted = await this.ragService.remove(id);
    if (!deleted) throw new NotFoundException('Document not found');
    return { message: 'Document deleted' };
  }
}
