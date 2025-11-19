import * as weave from 'weave';
export declare function initializeWeave(): Promise<boolean>;
export declare function isWeaveEnabled(): boolean;
export declare function isApiKeyAllowed(apiKey: string | undefined): boolean;
export declare function getWeaveOp(): typeof weave.op | (<T extends (...args: any[]) => any>(fn: T) => T);
export { weave };
//# sourceMappingURL=weave.d.ts.map