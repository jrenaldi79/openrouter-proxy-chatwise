import { Request, Response, NextFunction } from 'express';
export declare function creditsMethodValidation(req: Request, res: Response, next: NextFunction): void;
declare function handleCreditRequest(req: Request, res: Response): Promise<void>;
export declare const meCreditsHandler: typeof handleCreditRequest;
export declare const apiCreditsHandler: typeof handleCreditRequest;
export declare const v1CreditsHandler: typeof handleCreditRequest;
export {};
//# sourceMappingURL=credits.d.ts.map