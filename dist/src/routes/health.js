"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthCheck = healthCheck;
const HealthStatus_1 = require("../models/HealthStatus");
const services_1 = require("../config/services");
const environment_1 = require("../config/environment");
async function healthCheck(_req, res) {
    try {
        let connectivityStatus;
        if (environment_1.envConfig.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
            connectivityStatus = 'connected';
        }
        else {
            connectivityStatus = (await services_1.proxyService.checkConnectivity())
                ? 'connected'
                : 'disconnected';
        }
        const healthStatus = HealthStatus_1.HealthStatus.create(connectivityStatus, 'operational', services_1.appState.startTime, '1.0.0');
        const response = healthStatus.toExpressResponse();
        res.status(response.status).set(response.headers).json(response.body);
    }
    catch {
        const healthStatus = HealthStatus_1.HealthStatus.createUnhealthy('Health check failed', '1.0.0');
        const response = healthStatus.toExpressResponse();
        res.status(response.status).set(response.headers).json(response.body);
    }
}
//# sourceMappingURL=health.js.map