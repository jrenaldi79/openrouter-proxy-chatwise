import { Express } from 'express';
export declare function createApp(): Express;
export { createApp as default };
declare module 'express-serve-static-core' {
    interface Request {
        correlationId?: string;
    }
}
//# sourceMappingURL=app.d.ts.map