export declare class AuthToken {
    readonly raw: string;
    readonly token: string;
    readonly isValid: boolean;
    readonly format: string;
    private static readonly OPENROUTER_TOKEN_PATTERN;
    private static readonly BEARER_PREFIX;
    constructor(authorizationHeader: string);
    private parseAndValidate;
    private validateTokenFormat;
    getTokenHash(): string;
    getMaskedToken(): string;
    getAuthorizationHeader(): string;
    toSafeJSON(): Record<string, unknown>;
    static fromRequest(req: {
        headers: Record<string, string | string[] | undefined>;
    }): AuthToken | null;
    static isValidFormat(authorizationHeader: string): boolean;
    static validateBearerToken(token: string): boolean;
    static createBearerHeader(token: string): string;
    static extractToken(authorizationHeader: string): string | null;
    static secureCompare(a: string, b: string): boolean;
    equals(other: AuthToken): boolean;
    isEmpty(): boolean;
}
//# sourceMappingURL=AuthToken.d.ts.map