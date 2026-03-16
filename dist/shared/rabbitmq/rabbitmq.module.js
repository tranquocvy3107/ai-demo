"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var RabbitMQModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RabbitMQModule = void 0;
const common_1 = require("@nestjs/common");
const microservices_1 = require("@nestjs/microservices");
const config_1 = require("@nestjs/config");
const rabbitmq_service_1 = require("./rabbitmq.service");
let RabbitMQModule = RabbitMQModule_1 = class RabbitMQModule {
    static register(queueName) {
        return {
            module: RabbitMQModule_1,
            imports: [
                microservices_1.ClientsModule.registerAsync([
                    {
                        name: 'RABBITMQ_SERVICE',
                        imports: [config_1.ConfigModule],
                        useFactory: (configService) => {
                            const rmqHost = configService.get('rabbitmq.host');
                            const rmqPort = configService.get('rabbitmq.port');
                            const rmqUser = configService.get('rabbitmq.user');
                            const rmqPass = configService.get('rabbitmq.password');
                            const url = `amqp://${rmqUser}:${rmqPass}@${rmqHost}:${rmqPort}`;
                            return {
                                transport: microservices_1.Transport.RMQ,
                                options: {
                                    urls: [url],
                                    queue: queueName || 'default_queue',
                                    queueOptions: {
                                        durable: true,
                                    },
                                },
                            };
                        },
                        inject: [config_1.ConfigService],
                    },
                ]),
            ],
            exports: [microservices_1.ClientsModule],
        };
    }
};
exports.RabbitMQModule = RabbitMQModule;
exports.RabbitMQModule = RabbitMQModule = RabbitMQModule_1 = __decorate([
    (0, common_1.Module)({
        providers: [rabbitmq_service_1.RabbitMQService],
        exports: [rabbitmq_service_1.RabbitMQService],
    })
], RabbitMQModule);
//# sourceMappingURL=rabbitmq.module.js.map