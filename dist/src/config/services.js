"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.modelDataService = exports.balanceInjectionService = exports.proxyService = exports.appState = void 0;
const ProxyService_1 = require("../services/ProxyService");
const BalanceInjectionService_1 = require("../services/BalanceInjectionService");
const ModelDataService_1 = require("../services/ModelDataService");
const environment_1 = require("./environment");
exports.appState = {
    startTime: Date.now(),
};
exports.proxyService = new ProxyService_1.ProxyService(environment_1.envConfig.OPENROUTER_BASE_URL, environment_1.envConfig.REQUEST_TIMEOUT_MS);
exports.balanceInjectionService = new BalanceInjectionService_1.BalanceInjectionService(exports.proxyService, environment_1.envConfig.OPENROUTER_BASE_URL, environment_1.envConfig.REQUEST_TIMEOUT_MS);
exports.modelDataService = new ModelDataService_1.ModelDataService();
//# sourceMappingURL=services.js.map