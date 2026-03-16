import { DynamicModule } from '@nestjs/common';
export declare class RabbitMQModule {
    static register(queueName?: string): DynamicModule;
}
