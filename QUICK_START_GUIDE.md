# Quick Start: High-End Algorithmic Trading Setup

## Prerequisites
- Node.js 24+, PostgreSQL, Redis (optional but recommended)
- Zerodha Kite Connect API credentials
- NSE/BSE market data subscription

## 1. Database Setup (15 minutes)

```bash
# Linux / macOS
export DATABASE_URL="postgresql://user:password@localhost:5432/trading_db"

# Windows PowerShell
$env:DATABASE_URL = "postgresql://user:password@localhost:5432/trading_db"

# Install dependencies from the monorepo root
pnpm install

# Run Drizzle migrations for the database package
pnpm --filter @workspace/db run push
```

> Note: The repo already includes PostgreSQL/Drizzle support in `lib/db` with schema definitions, connection pooling, and migration scripts.

## 2. Start API Server (5 minutes)

```bash
# Start the API server
pnpm run start

# Server will be available at http://localhost:5000
```

## 3. Test Current Algorithms (10 minutes)

```bash
# Test signal generation
curl http://localhost:5000/api/signals

# Test options chain
curl http://localhost:5000/api/options-chain

# Test prediction
curl http://localhost:5000/api/predict
```

## 4. Broker Integration Setup (30 minutes)

### Zerodha Kite Connect
1. Sign up for Kite Connect: https://kite.trade/connect
2. Get API key and secret
3. Set environment variables:
```bash
export KITE_API_KEY="your_api_key"
export KITE_API_SECRET="your_api_secret"
```

### Update Execution Engine
Replace mock broker in `execution.ts` with real Kite Connect integration:

```typescript
import KiteConnect from 'kiteconnect-ts';

const kite = new KiteConnect({
  api_key: process.env.KITE_API_KEY
});

// Use kite.placeOrder() instead of mock execution
```

## 5. Real Market Data Integration (45 minutes)

### Replace Yahoo Finance with NSE Data
Update `signals.ts` and `optionsChain.ts`:

```typescript
// Replace Yahoo Finance calls with NSE API
async function fetchNSEData() {
  // Implement NSE API integration
  // Use https://www.nseindia.com/api/equity-stockIndices
}
```

### Add Real Options Data
```typescript
async function fetchNSEOptionsChain() {
  // Fetch from NSE options chain API
  // https://www.nseindia.com/api/option-chain-indices?symbol=BANKNIFTY
}
```

## 6. Risk Management Configuration (20 minutes)

Update risk limits in `risk.ts`:

```typescript
const riskLimits: RiskLimits = {
  maxPortfolioRisk: 0.02, // 2% max loss per trade
  maxDrawdownLimit: 0.05, // 5% max drawdown
  maxPositionSize: 0.10, // 10% max per position
  maxDailyLoss: 0.015, // 1.5% max daily loss
  maxConcentration: 0.20, // 20% max concentration
  minMarginBuffer: 0.30 // 30% margin buffer
};
```

## 7. Mobile App Updates (30 minutes)

Update mobile app to use new endpoints:

```typescript
// In mobile app, update API calls
const signals = await fetch(`${RENDER_API_URL}/signals`);
const execution = await fetch(`${RENDER_API_URL}/execution/execute-signal`, {
  method: 'POST',
  body: JSON.stringify({ signal, positionSize: 0.02 })
});
```

## 8. Performance Testing (20 minutes)

```bash
# Test execution speed
time curl http://localhost:5000/api/signals

# Test concurrent requests
ab -n 100 -c 10 http://localhost:5000/api/signals

# Monitor system resources
top -p $(pgrep node)
```

## 9. Go-Live Checklist

- [ ] Database backups configured
- [ ] SSL certificates installed
- [ ] Environment variables set
- [ ] Broker API connected
- [ ] Market data feeds active
- [ ] Risk limits configured
- [ ] Mobile app updated
- [ ] Performance tested
- [ ] Monitoring alerts set up

## 10. First Live Trade (5 minutes)

```bash
# Generate signal
curl http://localhost:5000/api/signals

# Execute if signal is strong
curl -X POST http://localhost:5000/api/execution/execute-signal \
  -H "Content-Type: application/json" \
  -d '{"signal": {"action": "BUY", "confidence": 85}, "positionSize": 0.02}'
```

## Expected Performance (First Month)

- **Signal Accuracy**: 65-75% win rate
- **Execution Speed**: <200ms per trade
- **Daily Returns**: 0.5-1.5%
- **Maximum Drawdown**: <3%
- **Sharpe Ratio**: 1.8-2.5

## Monitoring Commands

```bash
# Check system health
curl http://localhost:5000/api/healthz

# Monitor portfolio
curl http://localhost:5000/api/risk/portfolio

# Check execution performance
curl http://localhost:5000/api/execution/performance

# View recent signals
curl http://localhost:5000/api/signals | jq '.aggregatedSignal'
```

## Emergency Stop

```bash
# Cancel all pending orders
curl -X DELETE http://localhost:5000/api/execution/orders

# Update risk limits to conservative
curl -X PUT http://localhost:5000/api/risk/limits \
  -H "Content-Type: application/json" \
  -d '{"maxPortfolioRisk": 0.005, "maxDailyLoss": 0.005}'
```

This quick start gets you trading with professional-grade algorithms in under 2 hours. Focus on paper trading first to validate performance before going live with real money.</content>
<parameter name="filePath">c:\Trading_APP\NiftyF-O\QUICK_START_GUIDE.md