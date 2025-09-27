"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthToken = void 0;
class AuthToken {
    constructor(authorizationHeader) {
        this.raw = authorizationHeader;
        this.format = 'sk-or-v1-{key}';
        const { token, isValid } = this.parseAndValidate(authorizationHeader);
        this.token = token;
        this.isValid = isValid;
    }
    parseAndValidate(authHeader) {
        if (!authHeader.startsWith(AuthToken.BEARER_PREFIX)) {
            return { token: '', isValid: false };
        }
        const token = authHeader.substring(AuthToken.BEARER_PREFIX.length);
        const isValid = this.validateTokenFormat(token);
        return { token, isValid };
    }
    validateTokenFormat(token) {
        if (!token || token.trim() !== token || token.length === 0) {
            return false;
        }
        if (!AuthToken.OPENROUTER_TOKEN_PATTERN.test(token)) {
            return false;
        }
        if (token.length < 10) {
            return false;
        }
        if (token.includes(' ') || token.includes('\n') || token.includes('\t')) {
            return false;
        }
        return true;
    }
    getTokenHash() {
        if (!this.token) {
            return '';
        }
        const hash = this.token
            .split('')
            .reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0);
        return Math.abs(hash).toString(16);
    }
    getMaskedToken() {
        if (!this.token || this.token.length < 8) {
            return '***';
        }
        const start = this.token.substring(0, 4);
        const end = this.token.substring(this.token.length - 4);
        const maskLength = Math.max(3, this.token.length - 8);
        const mask = '*'.repeat(maskLength);
        return `${start}${mask}${end}`;
    }
    getAuthorizationHeader() {
        return this.raw;
    }
    toSafeJSON() {
        return {
            format: this.format,
            isValid: this.isValid,
            tokenHash: this.getTokenHash(),
            maskedToken: this.getMaskedToken(),
        };
    }
    static fromRequest(req) {
        const authHeader = req.headers['authorization'] || req.headers['Authorization'];
        const authHeaderString = Array.isArray(authHeader)
            ? authHeader[0]
            : authHeader;
        if (!authHeaderString) {
            return null;
        }
        return new AuthToken(authHeaderString);
    }
    static isValidFormat(authorizationHeader) {
        try {
            const authToken = new AuthToken(authorizationHeader);
            return authToken.isValid;
        }
        catch {
            return false;
        }
    }
    static validateBearerToken(token) {
        return AuthToken.OPENROUTER_TOKEN_PATTERN.test(token);
    }
    static createBearerHeader(token) {
        if (!token.startsWith(AuthToken.BEARER_PREFIX)) {
            return `${AuthToken.BEARER_PREFIX}${token}`;
        }
        return token;
    }
    static extractToken(authorizationHeader) {
        if (!authorizationHeader.startsWith(AuthToken.BEARER_PREFIX)) {
            return null;
        }
        const token = authorizationHeader.substring(AuthToken.BEARER_PREFIX.length);
        return AuthToken.validateBearerToken(token) ? token : null;
    }
    static secureCompare(a, b) {
        if (a.length !== b.length) {
            return false;
        }
        let result = 0;
        for (let i = 0; i < a.length; i++) {
            result |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }
        return result === 0;
    }
    equals(other) {
        return AuthToken.secureCompare(this.token, other.token);
    }
    isEmpty() {
        return !this.token || this.token.length === 0;
    }
}
exports.AuthToken = AuthToken;
AuthToken.OPENROUTER_TOKEN_PATTERN = /^sk-or-v1-.+/;
AuthToken.BEARER_PREFIX = 'Bearer ';
//# sourceMappingURL=AuthToken.js.map