import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { RabbitMQModule } from '../../shared/rabbitmq';
import { ResearchData } from './entities/research-data.entity';
import { SemrushTraffic } from './entities/semrush-traffic.entity';
import { AgentMemory } from './entities/agent-memory.entity';
import { RagModule } from '../rag';

@Module({
  imports: [
    RabbitMQModule.register('ai_queue'),
    TypeOrmModule.forFeature([ResearchData, SemrushTraffic, AgentMemory]),
    RagModule,
  ],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
