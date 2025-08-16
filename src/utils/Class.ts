// helper type for describing an uninstantiated class
export interface Class<T = unknown> extends Function {
    new (...args: any[]): T;
}
