/**
 * Service configuration and initialization
 */

import { ProxyService } from '../services/ProxyService';
import { BalanceInjectionService } from '../services/BalanceInjectionService';
import { ModelDataService } from '../services/ModelDataService';
import { envConfig } from './environment';

/**
 * Global application state
 */
export const appState = {
  startTime: Date.now(),
};

/**
 * Initialize and export service instances
 */
export const proxyService = new ProxyService(
  envConfig.OPENROUTER_BASE_URL,
  envConfig.REQUEST_TIMEOUT_MS
);

export const balanceInjectionService = new BalanceInjectionService(
  proxyService,
  envConfig.OPENROUTER_BASE_URL,
  envConfig.REQUEST_TIMEOUT_MS
);

export const modelDataService = new ModelDataService();
