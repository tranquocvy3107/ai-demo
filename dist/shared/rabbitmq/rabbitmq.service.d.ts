import { ClientProxy } from '@nestjs/microservices';
export declare class RabbitMQService {
    private readonly client;
    constructor(client: ClientProxy);
    emitMessage(pattern: any, data: any): Promise<void>;
    sendMessage<TResult = any, TInput = any>(pattern: any, data: TInput): Promise<TResult>;
}
