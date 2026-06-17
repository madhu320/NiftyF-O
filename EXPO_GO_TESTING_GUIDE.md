# Expo Go Testing Guide - Complete Feature Validation

## Current Status
✅ **Backend**: Running on port 3000 (http://127.0.0.1:3000)
✅ **All endpoints**: Verified responding with 200 OK
✅ **Configuration**: Centralized in `artifacts/mobile/constants/apiConfig.ts`

## Backend Endpoints Verified
```
✓ GET  /api/healthz             -> 200
✓ GET  /api/ant/auth/status     -> 200  
✓ GET  /api/ant/market/BANKNIFTY -> 200
✓ POST /api/predict             -> 200
✓ GET  /api/signals             -> 200
```

---

## Pre-Testing Setup

### 1. Environment Configuration

Add/update these to `.env.local` in root directory:

```bash
# Development Expo App Configuration
EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:3000/api

# Python Model Service
PYTHON_SERVICE_URL=http://127.0.0.1:8000

# Alice Blue (if testing auth)
ALICE_ENABLED=true
ALICE_API_KEY=W6329sgnmx
ALICE_API_SECRET=6TxaOUsKyjhhHo6MokD4qgfQfcdViTMg6rT5CZilA5rxGcG6tUhOdWfIN88s7cH8KiM34vCXw2LwLJ7GszK1HrBRWdmYSVj1h026
ALICE_USER_ID=1902101

# Node Environment
NODE_ENV=development
LOG_LEVEL=debug
```

### 2. Find Your Local IP Address

**Windows:**
```bash
ipconfig
# Look for "IPv4 Address" under your active network adapter
# Example: 192.168.x.x or 10.0.x.x
```

**macOS/Linux:**
```bash
ifconfig
# Look for inet under en0 or your active network interface
```

Set `EXPO_PUBLIC_API_URL=http://YOUR_IP:3000/api` in `.env.local`

### 3. Verify Backend is Running

```bash
# Check if backend is running
curl http://127.0.0.1:3000/api/healthz
# Should return: {"status":"ok"}

# Check auth status
curl http://127.0.0.1:3000/api/ant/auth/status
# Should return: {"isAuthenticated":false} or true depending on auth code
```

### 4. Start Backend

```bash
# From root of NiftyF-O workspace
node artifacts/api-server/dist/index.mjs

# Or with pnpm
pnpm run -F api-server start
```

Backend runs on **port 3000** and listens on all interfaces (0.0.0.0).

---

## Expo Go Testing Workflow

### Phase 1: Mobile App Installation & Launch

1. **Install Expo Go** from your device app store:
   - [iOS App Store](https://apps.apple.com/app/expo-go/id982107779)
   - [Android Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)

2. **Start Expo development server** from mobile app directory:
   ```bash
   cd artifacts/mobile
   npx expo start
   
   # Or with pnpm
   pnpm install  # if dependencies not installed
   pnpm exec expo start
   ```

3. **Connect in Expo Go**:
   - **Android**: Scan QR code with camera app or Expo Go app
   - **iOS**: Scan QR code in Expo Go (Camera tab)

4. **Verify app loads** - should see:
   - ✅ Bottom tabs: `Market` | `Options` | `History` | `Alice Blue`
   - ✅ No error boundaries or red screens
   - ✅ Screens load with mock/synthetic data

---

## Feature Testing Checklist

### ✅ Tab 1: Market Data (`artifacts/mobile/app/(tabs)/index.tsx`)

**Expected Features:**
- [ ] BANKNIFTY live price display
- [ ] NIFTY live price display
- [ ] Last updated timestamp
- [ ] Price change indicator (↑ green / ↓ red)
- [ ] Percentage change display

**Test Steps:**
```
1. Open "Market" tab
2. Wait 2-3 seconds for data fetch
3. Verify BANKNIFTY price displayed (should be ~45000-50000)
4. Verify NIFTY price displayed (should be ~20000-25000)
5. Check "Last updated" shows recent timestamp
6. Verify colors: Green for up, Red for down
```

**Success Criteria:**
- ✅ Prices load without errors
- ✅ No loading spinners after 5 seconds
- ✅ Data refreshes on tab focus or manual refresh

---

### ✅ Tab 2: Options Evaluator (`artifacts/mobile/app/(tabs)/options.tsx`)

**Expected Features:**
- [ ] Expiry selection dropdown
- [ ] Options chain display (Call/Put grid)
- [ ] Greeks display (Delta, Gamma, Theta, Vega)
- [ ] IV (Implied Volatility) display
- [ ] ATM selection highlighting
- [ ] Price chart below options chain
- [ ] "Execute Signal" button

**Test Steps:**
```
1. Open "Options" tab
2. Select expiry from dropdown (e.g., "Weekly", "Monthly")
3. Scroll through options chain
4. Verify Call side shows on left, Put side on right
5. Check Greeks values are reasonable:
   - Delta: 0 to 1 for Calls, -1 to 0 for Puts
   - Gamma: > 0 for all options
   - Theta: Typically negative
   - Vega: > 0 for all options
6. Tap on an option leg to see details
7. Tap "Execute Signal" button
8. Verify trade confirmation appears
```

**Success Criteria:**
- ✅ Options chain loads in under 3 seconds
- ✅ Greeks display with reasonable values
- ✅ ATM leg highlighted clearly
- ✅ Execute button triggers order flow

---

### ✅ Tab 3: Signal History (`artifacts/mobile/app/history.tsx`)

**Expected Features:**
- [ ] List of historical predictions
- [ ] Signal timestamp
- [ ] Symbol name (BANKNIFTY, NIFTY, etc.)
- [ ] Signal type (BUY, SELL, HOLD)
- [ ] Prediction confidence
- [ ] Technical indicators used
- [ ] ML model score

**Test Steps:**
```
1. Open "History" tab
2. Scroll through signal list
3. Tap on individual signal for details
4. Verify each signal shows:
   - Symbol
   - Entry price
   - Target price
   - Stop loss
   - Entry time
   - Signal confidence (0-100%)
5. Check chart displays for each signal
```

**Success Criteria:**
- ✅ List loads with at least 5 historical signals
- ✅ Signals show in reverse chronological order
- ✅ Details screen shows full signal information
- ✅ No crashes when scrolling or tapping signals

---

### ✅ Tab 4: Alice Blue Auth (`artifacts/mobile/app/alice-blue.tsx`)

**Expected Features:**
- [ ] Login status indicator
- [ ] Login button (if not authenticated)
- [ ] User info display (if authenticated)
- [ ] Positions list
- [ ] Portfolio summary
- [ ] Logout button
- [ ] Refresh positions button

**Test Steps:**
```
1. Open "Alice Blue" tab
2. Verify initial state shows login button
3. Tap "Login with Alice Blue"
4. Verify browser opens Alice Blue login page
5. Login with Alice Blue credentials (if available)
6. Verify auth callback redirects back to app
7. Check positions load and display
8. Verify portfolio summary shows:
   - Total holdings
   - Unrealized P&L
   - Current balance
9. Tap refresh button and verify positions update
```

**Success Criteria:**
- ✅ Auth flow completes without errors
- ✅ Positions load after successful auth
- ✅ User can logout and re-login
- ✅ Positions update correctly

---

## Advanced Testing: AI Prediction & Mock Data

### Test Prediction Endpoint

```bash
# Test prediction with synthetic data (broker unavailable)
curl -X POST http://127.0.0.1:3000/api/predict \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BANKNIFTY","signal":"BUY"}'

# Expected response:
{
  "symbol": "BANKNIFTY",
  "signal": "BUY",
  "confidence": 75,
  "entryPrice": 45123.45,
  "targetPrice": 46200,
  "stopLoss": 44900,
  "technicalScore": 82,
  "mlScore": 68,
  "indicators": {
    "ema_20": 45100,
    "rsi": 65,
    "bollinger_bands": {...}
  },
  "dataSource": "synthetic"  # Falls back to synthetic when broker unavailable
}
```

### Test Signals Endpoint

```bash
# Get all generated signals
curl http://127.0.0.1:3000/api/signals

# Expected response:
[
  {
    "id": "sig_12345",
    "symbol": "BANKNIFTY",
    "signal": "BUY",
    "timestamp": "2024-01-15T14:30:00Z",
    "confidence": 78,
    "entryPrice": 45120,
    "targetPrice": 46500,
    "stopLoss": 44900
  }
]
```

### Test with Mock ML Model

Mock the Python service if it's not running:

```bash
# Create simple mock server on port 8000
echo "Creating mock Python service..."

# In a new terminal:
python -m http.server 8000 &

# Or run this JavaScript mock:
node -e "
const http = require('http');
http.createServer((req, res) => {
  if (req.url === '/predict') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ score: 0.75, ml_signal: 'BUY' }));
  }
  res.writeHead(404);
  res.end();
}).listen(8000, () => console.log('Mock ML service on 8000'));
"
```

---

## Feature Integration Tests

### Test 1: Full Signal Flow (Market → Prediction → Execution)

```
1. Open Market tab
2. Note current BANKNIFTY price
3. Switch to Options tab
4. Verify prediction loaded and price close to market price
5. Tap option leg
6. Tap "Execute Signal"
7. Confirm order popup appears
8. Switch to History tab
9. Verify new signal appears in history
10. Check P&L calculations are working
```

### Test 2: Real-Time Data Updates

```
1. Open Market tab
2. Note current price and timestamp
3. Wait 30 seconds
4. Pull down to refresh
5. Verify price updated and timestamp changed
6. Price should not jump drastically (if broker data available)
```

### Test 3: Portfolio Sync (Alice Blue)

```
1. Log in via Alice Blue tab
2. Note portfolio summary (balance, holdings)
3. Switch to Options tab
4. Execute a test order
5. Go back to Alice Blue tab
6. Tap refresh
7. Verify portfolio updated (should show small change if mocking)
```

### Test 4: Offline Mode & Graceful Degradation

```
1. Turn off device WiFi
2. Wait 5 seconds
3. Verify app shows "Offline" indicator
4. App should show cached/synthetic data
5. Predictions should use fallback synthetic history
6. Turn WiFi back on
7. Verify app reconnects and fetches fresh data
```

### Test 5: Performance Under Load

```
1. Open Options tab
2. Rapidly scroll through options chain
3. Tap multiple option legs quickly
4. Switch between tabs rapidly
5. Verify no crashes or significant lag
6. Check memory usage (in device developer menu)
7. Verify app recovers gracefully if lag occurs
```

---

## Production Testing Checklist

### Before Going to Production

- [ ] All environment variables in `.env.local` correctly set
- [ ] `EXPO_PUBLIC_API_URL` points to production Render URL: `https://nifty-bank-index-f-and-o.onrender.com/api`
- [ ] All hardcoded URLs removed (verified ✅)
- [ ] HTTPS endpoints used for production
- [ ] SSL certificates valid
- [ ] Alice Blue credentials secured (env vars, not hardcoded)
- [ ] Python model service deployed and accessible
- [ ] Database migrations applied
- [ ] Logging configured for production (LOG_LEVEL=info)
- [ ] Error tracking enabled (Sentry, DataDog, etc.)
- [ ] Rate limiting enabled on API
- [ ] CORS policies properly configured
- [ ] Sensitive data not logged

### Production Environment Variables

```bash
# .env.production
NODE_ENV=production
LOG_LEVEL=info
PYTHON_SERVICE_URL=https://ml-model.example.com/predict
PORT=5000
HOST=0.0.0.0

# Render deployment
ALICE_ENABLED=true
ALICE_FRONTEND_REDIRECT_URL=https://nifty-bank-index-f-and-o.onrender.com

# Mobile app points to production
EXPO_PUBLIC_API_URL=https://nifty-bank-index-f-and-o.onrender.com/api
```

---

## Troubleshooting

### Issue: "Cannot connect to API"

**Solutions:**
```bash
1. Verify backend is running: curl http://127.0.0.1:3000/api/healthz
2. Check EXPO_PUBLIC_API_URL env var is set correctly
3. Verify firewall allows port 3000 connections
4. On Android, ensure you're using correct local IP (not 127.0.0.1)
5. Check backend logs for errors
```

### Issue: "Mock data instead of real market data"

**Solutions:**
```bash
1. Verify Alice Blue credentials in .env.local
2. Set ALICE_ENABLED=true
3. Check if auth code is valid (Alice auth expires)
4. Enable logging: LOG_LEVEL=debug in .env.local
5. Check backend logs: tail -f server.log
```

### Issue: "Prediction endpoint returns 502 Bad Gateway"

**Solutions:**
```bash
1. Verify Python service running: curl http://127.0.0.1:8000/predict
2. Check PYTHON_SERVICE_URL env var
3. Verify backend uses fallback synthetic history
4. Check backend logs for Python service connection errors
5. Restart Python service if crashed
```

### Issue: "Options chain not loading"

**Solutions:**
```bash
1. Verify /api/ant/options-chain endpoint: curl http://127.0.0.1:3000/api/ant/options-chain
2. Check if Alice auth is valid
3. Verify selected expiry is valid
4. Check browser console for fetch errors
5. Look at network tab to see actual request/response
```

### Issue: "App freezes or lags"

**Solutions:**
```bash
1. Check React Native debugger: 
   - Open Expo menu (Cmd+M on iOS, shake on Android)
   - Enable Debug Mode
   - Check console for warnings/errors
2. Use React DevTools to profile component renders
3. Reduce animation complexity if low-end device
4. Check for console errors: chrome://inspect
5. Profile network requests (DevTools Network tab)
```

---

## Testing Metrics to Track

- [ ] **Load Time**: How long until each tab shows data
- [ ] **Data Freshness**: How often do prices update
- [ ] **API Response Time**: Measure /api/predict latency
- [ ] **Memory Usage**: Check for memory leaks
- [ ] **Battery Impact**: How much battery does app use
- [ ] **Network Bandwidth**: How much data app consumes
- [ ] **Error Rate**: Percentage of API failures
- [ ] **Crash Rate**: Percentage of app crashes
- [ ] **Feature Coverage**: What percentage of features working

---

## Next Steps After Testing

1. **Document any bugs** found during testing
2. **Optimize performance** based on load time measurements
3. **Add error tracking** (Sentry, DataDog, etc.)
4. **Set up CI/CD** for automated testing
5. **Deploy to production** using Render or similar platform
6. **Set up monitoring** for production metrics
7. **Plan feature rollout** (alpha → beta → production)

---

## References

- **Expo Documentation**: https://docs.expo.dev/
- **Alice Blue API**: https://www.aliceblueonline.com/api-docs
- **React Native Debugging**: https://reactnative.dev/docs/debugging
- **Performance Optimization**: https://docs.expo.dev/guides/performance/

---

Generated: 2024-01-15
API Endpoints: All ✅ Verified
Configuration: ✅ Centralized
Testing Status: Ready to begin
