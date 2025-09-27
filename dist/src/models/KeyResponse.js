"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeyResponse = void 0;
class KeyResponse {
    constructor(data) {
        this.limit = data.limit;
        this.usage = data.usage;
        const { limit, usage, ...rest } = data;
        this.additionalFields = rest;
        this.validate();
    }
    validate() {
        if (typeof this.usage !== 'number') {
            throw new Error('usage must be a number');
        }
        if (this.usage < 0) {
            throw new Error('usage must be non-negative');
        }
        if (this.limit !== null && typeof this.limit !== 'number') {
            throw new Error('limit must be a number or null');
        }
        if (typeof this.limit === 'number' && this.limit < 0) {
            throw new Error('limit must be non-negative');
        }
    }
    isUnlimitedAccount() {
        return this.limit === null;
    }
    getRemainingCredits() {
        if (this.isUnlimitedAccount()) {
            return null;
        }
        return Math.max(0, this.limit - this.usage);
    }
    getUsagePercentage() {
        if (this.isUnlimitedAccount()) {
            return null;
        }
        if (this.limit === 0) {
            return this.usage > 0 ? 100 : 0;
        }
        return (this.usage / this.limit) * 100;
    }
    hasExceededLimit() {
        if (this.isUnlimitedAccount()) {
            return false;
        }
        return this.usage > this.limit;
    }
    toJSON() {
        return {
            limit: this.limit,
            usage: this.usage,
            ...this.additionalFields,
        };
    }
    static fromApiResponse(response) {
        if (!response || typeof response !== 'object') {
            throw new Error('Invalid API response: not an object');
        }
        const data = response;
        if (!('usage' in data)) {
            throw new Error('Invalid API response: missing usage field');
        }
        return new KeyResponse(data);
    }
    static isValidResponse(data) {
        try {
            KeyResponse.fromApiResponse(data);
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.KeyResponse = KeyResponse;
//# sourceMappingURL=KeyResponse.js.map