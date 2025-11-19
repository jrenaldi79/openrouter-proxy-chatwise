import { Express, Request, Response, NextFunction } from 'express';
export declare function configureTrustProxy(app: Express): void;
export declare function securityMiddleware(req: Request, res: Response, next: NextFunction): void;
export declare function configureRateLimit(app: Express): void;
export declare function applySecurity(app: Express): void;
//# sourceMappingURL=security.d.ts.map