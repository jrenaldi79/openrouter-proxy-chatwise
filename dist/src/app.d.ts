import { Express } from 'express';
declare global {
    namespace Express {
        interface Request {
            balanceInjectionActive?: {
                chatId: string;
                responseStarted: boolean;
            };
        }
    }
}
export declare function createApp(): Express;
export { createApp as default };
declare module 'express-serve-static-core' {
    interface Request {
        correlationId?: string;
    }
}
//# sourceMappingURL=app.d.ts.map