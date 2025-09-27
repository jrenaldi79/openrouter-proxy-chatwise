export interface KeyResponseData {
    limit: number | null;
    usage: number;
    [key: string]: unknown;
}
export declare class KeyResponse {
    readonly limit: number | null;
    readonly usage: number;
    readonly additionalFields: Record<string, unknown>;
    constructor(data: KeyResponseData);
    private validate;
    isUnlimitedAccount(): boolean;
    getRemainingCredits(): number | null;
    getUsagePercentage(): number | null;
    hasExceededLimit(): boolean;
    toJSON(): KeyResponseData;
    static fromApiResponse(response: unknown): KeyResponse;
    static isValidResponse(data: unknown): boolean;
}
//# sourceMappingURL=KeyResponse.d.ts.map