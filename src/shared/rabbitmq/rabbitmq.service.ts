import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class RabbitMQService {
  constructor(
    @Inject('RABBITMQ_SERVICE') private readonly client: ClientProxy,
  ) {}

  public async emitMessage(pattern: any, data: any): Promise<void> {
    this.client.emit(pattern, data);
  }

  public async sendMessage<TResult = any, TInput = any>(
    pattern: any,
    data: TInput,
  ): Promise<TResult> {
    return lastValueFrom(this.client.send(pattern, data));
  }
}
