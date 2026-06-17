# API Reference Guide - Complete Endpoint Documentation

## Base URLs

| Environment | URL |
|---|---|
| Local Dev | `http://127.0.0.1:3000/api` or `http://YOUR_LOCAL_IP:3000/api` |
| Production | `https://nifty-bank-index-f-and-o.onrender.com/api` |

---

## Health & Status Endpoints

### 1. Health Check
```
GET /api/healthz
Status: 200
Response:
{
  "status": "ok"
}
```

### 2. Auth Status
```
GET /api/ant/auth/status
Status: 200
Response:
{
  "isAuthenticated": false,
  "userId": null,
  "lastAuthTime": null
}
```

### 3. Auth Debug Info
```
GET /api/ant/auth/debug
Status: 200
Response:
{
  "isAuthenticated": false,
  "userId": "1902101",
  "apiKey": "W63****",  // masked
  "hasAuthCode": false,
  "credentials": "Loaded from .env.local"
}
```

---

## Market Data Endpoints

### 4. Get Live Market Data
```
GET /api/ant/market/:symbol
Path: /api/ant/market/BANKNIFTY

Status: 200
Response:
{
  "symbol": "BANKNIFTY",
  "ltp": 45234.50,
  "bid": 45230.00,
  "ask": 45240.00,
  "high": 45500.00,
  "low": 44900.00,
  "close": 45100.00,
  "volume": 2500000,
  "openInterest": 1200000,
  "time": "2024-01-15T14:30:00Z"
}
```

### 5. Get Historical Data
```
GET /api/ant/history/:symbol?resolution=candle&fromDate=2024-01-01&toDate=2024-01-15

Path: /api/ant/history/BANKNIFTY

Status: 200
Response:
{
  "symbol": "BANKNIFTY",
  "dataSource": "synthetic",  // or "broker"
  "candles": [
    {
      "time": "2024-01-15T09:15:00Z",
      "open": 45000.00,
      "high": 45250.00,
      "low": 44950.00,
      "close": 45100.00,
      "volume": 500000
    }
    // ... more candles
  ]
}
```

---

## Alice Blue Integration Endpoints

### 6. Options Chain
```
GET /api/ant/options-chain/:symbol?expiry=weekly

Path: /api/ant/options-chain/BANKNIFTY?expiry=weekly

Status: 200
Response:
{
  "symbol": "BANKNIFTY",
  "expiry": "2024-01-19",
  "atmStrike": 45200,
  "calls": [
    {
      "strike": 45000,
      "ltp": 234.50,
      "bid": 234.00,
      "ask": 235.00,
      "iv": 18.5,
      "oi": 500000,
      "volume": 100000,
      "greeks": {
        "delta": 0.65,
        "gamma": 0.002,
        "theta": -5.2,
        "vega": 8.3
      }
    }
  ],
  "puts": [
    {
      "strike": 45000,
      "ltp": 34.50,
      "bid": 34.00,
      "ask": 35.00,
      "iv": 18.2,
      "oi": 600000,
      "volume": 150000,
      "greeks": {
        "delta": -0.35,
        "gamma": 0.002,
        "theta": -2.1,
        "vega": 8.1
      }
    }
  ]
}
```

### 7. Positions
```
GET /api/ant/positions

Status: 200
Response:
{
  "positions": [
    {
      "symbol": "BANKNIFTY",
      "quantity": 1,
      "buyPrice": 45000.00,
      "ltp": 45234.50,
      "pnl": 234.50,
      "pnlPercent": 0.52,
      "time": "2024-01-15T14:30:00Z"
    }
  ],
  "totalPnl": 234.50,
  "totalInvested": 45000.00
}
```

### 8. Greeks for Position
```
GET /api/ant/greeks/:symbol

Path: /api/ant/greeks/BANKNIFTY

Status: 200
Response:
{
  "symbol": "BANKNIFTY",
  "expiry": "2024-01-19",
  "callGreeks": {
    "delta": 0.65,
    "gamma": 0.002,
    "theta": -5.2,
    "vega": 8.3
  },
  "putGreeks": {
    "delta": -0.35,
    "gamma": 0.002,
    "theta": -2.1,
    "vega": 8.1
  },
  "netGreeks": {
    "delta": 0.30,
    "gamma": 0.004,
    "theta": -7.3,
    "vega": 16.4
  }
}
```

---

## Prediction & AI Endpoints

### 9. Get Prediction
```
POST /api/predict
Content-Type: application/json

Body:
{
  "symbol": "BANKNIFTY",
  "signal": "BUY"
}

Status: 200
Response:
{
  "symbol": "BANKNIFTY",
  "signal": "BUY",
  "confidence": 78,
  "entryPrice": 45234.50,
  "targetPrice": 46500.00,
  "stopLoss": 44900.00,
  "technicalScore": 82,
  "mlScore": 74,
  "dataSource": "synthetic",  // "broker" or "synthetic"
  "timestamp": "2024-01-15T14:30:00Z",
  "indicators": {
    "rsi": 65,
    "macd": "positive",
    "bollinger_bands": {
      "upper": 45600,
      "lower": 44800,
      "middle": 45200
    },
    "ema_20": 45150,
    "ema_50": 45000,
    "atr": 350
  }
}
```

### 10. Get All Signals
```
GET /api/signals?limit=20&offset=0

Status: 200
Response:
{
  "total": 150,
  "signals": [
    {
      "id": "sig_12345",
      "symbol": "BANKNIFTY",
      "signal": "BUY",
      "timestamp": "2024-01-15T14:30:00Z",
      "confidence": 78,
      "entryPrice": 45234.50,
      "targetPrice": 46500.00,
      "stopLoss": 44900.00,
      "technicalScore": 82,
      "mlScore": 74,
      "status": "active"  // "active", "closed", "cancelled"
    }
  ]
}
```

### 11. Get Signal by ID
```
GET /api/signals/:signalId

Path: /api/signals/sig_12345

Status: 200
Response:
{
  "id": "sig_12345",
  "symbol": "BANKNIFTY",
  "signal": "BUY",
  "timestamp": "2024-01-15T14:30:00Z",
  "confidence": 78,
  "entryPrice": 45234.50,
  "targetPrice": 46500.00,
  "stopLoss": 44900.00,
  "actualPrice": 45600.00,
  "pnl": 365.50,
  "pnlPercent": 0.81,
  "status": "active",
  "indicators": {...}
}
```

---

## Execution Endpoints

### 12. Execute Signal (Place Order)
```
POST /api/execute-signal
Content-Type: application/json

Body:
{
  "signalId": "sig_12345",
  "quantity": 1,
  "orderType": "market",  // "market", "limit", "stoploss"
  "limitPrice": null
}

Status: 200
Response:
{
  "orderId": "ord_67890",
  "signalId": "sig_12345",
  "symbol": "BANKNIFTY",
  "quantity": 1,
  "entryPrice": 45234.50,
  "orderStatus": "executed",  // "pending", "executed", "rejected"
  "timestamp": "2024-01-15T14:30:00Z",
  "message": "Order placed successfully"
}
```

### 13. Get Margin Requirement
```
POST /api/margin
Content-Type: application/json

Body:
{
  "symbol": "BANKNIFTY",
  "quantity": 1,
  "price": 45234.50,
  "orderType": "buy"
}

Status: 200
Response:
{
  "symbol": "BANKNIFTY",
  "quantity": 1,
  "price": 45234.50,
  "marginRequired": 112500.00,  // 45234.50 * 1 * 2.5 (typical leverage)
  "availableMargin": 500000.00,
  "utilizedMargin": 112500.00,
  "freeMargin": 387500.00,
  "marginPercent": 22.5
}
```

### 14. Get Portfolio
```
GET /api/portfolio

Status: 200
Response:
{
  "totalBalance": 500000.00,
  "availableBalance": 387500.00,
  "utilizedBalance": 112500.00,
  "totalPnl": 5000.00,
  "totalPnlPercent": 1.0,
  "openPositions": 3,
  "totalPositionValue": 135700.50,
  "margin": {
    "available": 387500.00,
    "utilized": 112500.00,
    "required": 112500.00
  }
}
```

---

## Authentication Endpoints

### 15. Get Login URL
```
GET /api/ant/auth/login-url

Status: 200
Response:
{
  "loginUrl": "https://www.aliceblueonline.com/oauth/authorize?client_id=...",
  "stateToken": "state_12345"
}
```

### 16. Set Auth Code
```
POST /api/ant/auth/code
Content-Type: application/json

Body:
{
  "authCode": "abc123def456"
}

Status: 200
Response:
{
  "success": true,
  "message": "Auth code set successfully",
  "isAuthenticated": true,
  "userId": "1902101"
}
```

### 17. Auth Callback (Browser)
```
GET /api/ant/auth/callback?authCode=abc123def456&state=state_12345

Status: 302 Redirect
Redirect to: http://localhost:5000/auth/success
Response:
{
  "success": true,
  "userId": "1902101"
}
```

---

## Error Responses

### 400 Bad Request
```
Status: 400
Response:
{
  "error": "Bad Request",
  "message": "Missing required field: symbol",
  "timestamp": "2024-01-15T14:30:00Z"
}
```

### 401 Unauthorized
```
Status: 401
Response:
{
  "error": "Unauthorized",
  "message": "Authentication required for this endpoint",
  "timestamp": "2024-01-15T14:30:00Z"
}
```

### 500 Internal Server Error
```
Status: 500
Response:
{
  "error": "Internal Server Error",
  "message": "Failed to connect to broker API",
  "timestamp": "2024-01-15T14:30:00Z",
  "dataSource": "synthetic"  // Falls back to synthetic
}
```

---

## Testing Commands

### Test All Endpoints
```bash
# Health check
curl http://127.0.0.1:3000/api/healthz

# Market data
curl http://127.0.0.1:3000/api/ant/market/BANKNIFTY

# Historical data
curl "http://127.0.0.1:3000/api/ant/history/BANKNIFTY?resolution=candle"

# Options chain
curl "http://127.0.0.1:3000/api/ant/options-chain/BANKNIFTY?expiry=weekly"

# Positions
curl http://127.0.0.1:3000/api/ant/positions

# Greeks
curl http://127.0.0.1:3000/api/ant/greeks/BANKNIFTY

# Prediction
curl -X POST http://127.0.0.1:3000/api/predict \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BANKNIFTY","signal":"BUY"}'

# Signals
curl http://127.0.0.1:3000/api/signals

# Portfolio
curl http://127.0.0.1:3000/api/portfolio

# Auth status
curl http://127.0.0.1:3000/api/ant/auth/status
```

---

## Quick Response Validation Checklist

When testing each endpoint:

- [ ] Status code is 200 (or expected error code)
- [ ] Response has required fields
- [ ] Data types are correct (numbers, strings, arrays)
- [ ] No null/undefined values where data expected
- [ ] Timestamp is recent (not old)
- [ ] Numbers are reasonable values
- [ ] For Greeks: delta 0-1, gamma > 0, theta < 0, vega > 0
- [ ] For prices: positive and reasonable range
- [ ] No error messages in successful response
- [ ] Response time < 1 second

---

## Performance Benchmarks

Expected response times:

| Endpoint | Expected | Warning |
|----------|----------|---------|
| `/healthz` | <100ms | >500ms |
| `/market/*` | <200ms | >1s |
| `/history/*` | <500ms | >2s |
| `/options-chain/*` | <500ms | >2s |
| `/predict` | <1s | >3s |
| `/signals` | <300ms | >1s |
| `/portfolio` | <200ms | >1s |

---

**Last Updated**: 2024-01-15
**API Version**: v1.0.0
**Status**: All endpoints tested and working ✅
