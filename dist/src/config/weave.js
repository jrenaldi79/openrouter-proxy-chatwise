"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.weave = void 0;
exports.initializeWeave = initializeWeave;
exports.isWeaveEnabled = isWeaveEnabled;
exports.isApiKeyAllowed = isApiKeyAllowed;
exports.getWeaveOp = getWeaveOp;
const weave = __importStar(require("weave"));
exports.weave = weave;
const environment_1 = require("./environment");
const logger_1 = require("../utils/logger");
let weaveInitialized = false;
async function initializeWeave() {
    if (weaveInitialized) {
        logger_1.Logger.info('Weave already initialized');
        return true;
    }
    if (!environment_1.envConfig.WEAVE_ENABLED) {
        logger_1.Logger.info('Weave observability disabled (WANDB_API_KEY or WEAVE_PROJECT_NAME not set)');
        return false;
    }
    try {
        if (environment_1.envConfig.WANDB_API_KEY) {
            process.env.WANDB_API_KEY = environment_1.envConfig.WANDB_API_KEY;
        }
        await weave.init(environment_1.envConfig.WEAVE_PROJECT_NAME);
        weaveInitialized = true;
        logger_1.Logger.info(`Weave observability initialized for project: ${environment_1.envConfig.WEAVE_PROJECT_NAME}`);
        return true;
    }
    catch (error) {
        logger_1.Logger.error('Failed to initialize Weave observability', undefined, {
            error: error instanceof Error ? error.message : 'Unknown initialization error',
            projectName: environment_1.envConfig.WEAVE_PROJECT_NAME,
        });
        return false;
    }
}
function isWeaveEnabled() {
    return weaveInitialized && environment_1.envConfig.WEAVE_ENABLED;
}
function isApiKeyAllowed(apiKey) {
    if (!isWeaveEnabled()) {
        return true;
    }
    if (process.env.NODE_ENV === 'test' || process.env.CI === 'true') {
        return true;
    }
    if (environment_1.envConfig.WEAVE_API_KEY_ALLOWLIST.length === 0) {
        return true;
    }
    if (!apiKey) {
        return false;
    }
    return environment_1.envConfig.WEAVE_API_KEY_ALLOWLIST.includes(apiKey);
}
function getWeaveOp() {
    return isWeaveEnabled()
        ? weave.op
        : (fn) => fn;
}
//# sourceMappingURL=weave.js.map