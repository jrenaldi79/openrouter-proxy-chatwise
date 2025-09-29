# OpenRouter Proxy Monitoring

This directory contains all monitoring configuration and setup files for the OpenRouter proxy service.

## 📁 Files Overview

### **Setup & Status**
- `MONITORING-SETUP-COMPLETE.md` - **Main file**: Current status and next steps
- `monitoring-setup.yaml` - Configuration reference

### **Alert Policies** (for manual Google Cloud Console setup)
- `alert-high-error-rate.json` - High 4xx/5xx error rate alerts
- `alert-openrouter-failures.json` - OpenRouter API communication failures
- `alert-service-down.json` - Service availability monitoring
- `alert-high-latency.json` - Performance degradation alerts

### **Testing**
- `tests/` - Directory containing all monitoring test scripts
  - `test-monitoring.js` - Script to test monitoring setup and generate sample metrics
  - `test-alert.js` - Alert testing script
  - `test-balance-injection.js` - Balance injection testing
  - `aggressive-test.js` - Stress testing script
  - Other performance and load testing scripts

## 🚀 Quick Start

1. **Check current status**: Read `MONITORING-SETUP-COMPLETE.md`
2. **Test monitoring**: Run `node monitoring/tests/test-monitoring.js`
3. **Complete setup**: Follow the Google Cloud Console steps in the main file

## 📊 What's Monitored

- **Error rates** - 4xx/5xx HTTP responses
- **OpenRouter API health** - External dependency monitoring
- **Response latency** - Performance tracking
- **Service availability** - Uptime monitoring
- **Resource usage** - CPU/Memory via Cloud Run built-ins

## 🔔 Notifications

Email alerts configured for: `jrenaldi79@gmail.com`