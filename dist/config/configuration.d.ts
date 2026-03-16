declare const _default: () => {
    port: number;
    database: {
        host: string;
        port: number;
        username: string;
        password: string;
        name: string;
    };
    rabbitmq: {
        user: string;
        password: string;
        host: string;
        port: number;
    };
    ai: {
        openaiKey: string | undefined;
        anthropicKey: string | undefined;
        ollamaBaseUrl: string;
    };
};
export default _default;
