import { Express, Request, Response, NextFunction } from 'express';
export declare function bodyParserErrorHandler(error: Error & {
    type?: string;
}, req: Request, res: Response, next: NextFunction): void;
export declare function applyBodyParsing(app: Express): void;
//# sourceMappingURL=parsing.d.ts.map