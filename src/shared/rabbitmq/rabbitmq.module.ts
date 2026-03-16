import { Module, DynamicModule } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { RabbitMQService } from './rabbitmq.service';

@Module({
  providers: [RabbitMQService],
  exports: [RabbitMQService],
})
export class RabbitMQModule {
  static register(queueName?: string): DynamicModule {
    return {
      module: RabbitMQModule,
      imports: [
        ClientsModule.registerAsync([
          {
            name: 'RABBITMQ_SERVICE',
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => {
              const rmqHost = configService.get<string>('rabbitmq.host');
              const rmqPort = configService.get<number>('rabbitmq.port');
              const rmqUser = configService.get<string>('rabbitmq.user');
              const rmqPass = configService.get<string>('rabbitmq.password');
              const url = `amqp://${rmqUser}:${rmqPass}@${rmqHost}:${rmqPort}`;

              return {
                transport: Transport.RMQ,
                options: {
                  urls: [url],
                  queue: queueName || 'default_queue',
                  queueOptions: {
                    durable: true,
                  },
                },
              };
            },
            inject: [ConfigService],
          },
        ]),
      ],
      exports: [ClientsModule],
    };
  }
}
