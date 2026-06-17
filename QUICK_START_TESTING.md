# Quick Start Guide - Development & Testing

## 🚀 Quick Setup (5 minutes)

### Step 1: Get Your Local IP Address

**Windows**:
```bash
ipconfig
# Look for "IPv4 Address" like 192.168.1.10 or 10.0.x.x
```

**macOS/Linux**:
```bash
ifconfig
# Look for "inet" address on en0 or eth0
```

### Step 2: Update .env.local

```bash
# Edit file: NiftyF-O/.env.local
EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:3000/api
PYTHON_SERVICE_URL=http://127.0.0.1:8000
LOG_LEVEL=debug
NODE_ENV=development
```

Replace `YOUR_LOCAL_IP` with your actual IP from Step 1.

### Step 3: Start Backend (Terminal 1)

```bash
cd c:\Trading_APP\NiftyF-O
node artifacts/api-server/dist/index.mjs
```

Wait for output: `✓ Server listening on port: 3000`

### Step 4: Verify Backend Works

```bash
# In new Terminal 2
curl http://127.0.0.1:3000/api/healthz
# Should return: {"status":"ok"}
```

### Step 5: Start Expo Dev Server (Terminal 3)

```bash
cd artifacts/mobile
pnpm exec expo start
```

Wait for QR code to appear.

### Step 6: Connect Mobile Device

- **Android**: Scan QR code with Expo Go app
- **iOS**: Scan QR code in Expo Go (Camera tab)

App should load in 10-30 seconds.

✅ Done! You're ready to test.

---

## 🧪 Quick Testing

### Test 1: Market Data
```
1. Open "Market" tab in app
2. Should see BANKNIFTY price (45k-50k range)
3. Should see NIFTY price (20k-25k range)
4. Prices should have green/red color indicator
```

### Test 2: Prediction
```
1. Go to "Options" tab
2. Should see options chain load in <3 seconds
3. Should see Greeks values (Delta, Gamma, Theta, Vega)
4. Should see price prediction
```

### Test 3: Signals
```
1. Go to "History" tab
2. Should see list of historical signals
3. Each signal should show: symbol, time, confidence, price
4. Tap on signal to see full details
```

### Test 4: Alice Blue Auth (if configured)
```
1. Go to "Alice Blue" tab
2. Tap "Login with Alice Blue"
3. Should redirect to login page
4. Login and return to app
5. Should show positions and portfolio
```

---

## 🔍 Troubleshooting

### Backend not starting?
```bash
# Make sure port 3000 is free
netstat -ano | findstr :3000  # Windows
lsof -i :3000                 # macOS/Linux

# If in use, kill it
taskkill /PID <PID> /F        # Windows
kill -9 <PID>                 # macOS/Linux
```

### App won't connect to backend?
```bash
# Verify EXPO_PUBLIC_API_URL is set correctly
echo %EXPO_PUBLIC_API_URL%      # Windows
echo $EXPO_PUBLIC_API_URL       # macOS/Linux

# Verify backend is running
curl http://127.0.0.1:3000/api/healthz

# Check you're using YOUR IP, not 127.0.0.1 or localhost
# (mobile device can't reach host localhost)
```

### Prediction endpoint returning error?
```bash
# Verify Python service (if needed)
curl http://127.0.0.1:8000/predict

# Check backend uses fallback
curl -X POST http://127.0.0.1:3000/api/predict \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BANKNIFTY","signal":"BUY"}'
```

### App freezing or slow?
```bash
# Check backend logs for errors
# Reduce network request frequency
# Check device performance (Settings > Developer Options)
# Profile with React DevTools
```

---

## 📊 Testing Checklist

### Market Data
- [ ] BANKNIFTY price loads
- [ ] NIFTY price loads
- [ ] Prices update on refresh
- [ ] Color indicators work (green/red)
- [ ] No crashes on tab switch

### Options Chain
- [ ] Options load within 3 seconds
- [ ] Call/Put sides display
- [ ] Greeks values show
- [ ] ATM highlighted
- [ ] Can tap option legs
- [ ] Can execute signals

### Predictions & AI
- [ ] Prediction loads quickly
- [ ] ML score displays
- [ ] Technical indicators show
- [ ] Synthetic data fallback works
- [ ] Confidence scores reasonable

### Auth (Alice Blue)
- [ ] Login button clickable
- [ ] Browser opens login page
- [ ] App receives callback
- [ ] Positions load after auth
- [ ] Can logout
- [ ] Can re-login

### General
- [ ] No console errors
- [ ] No red error screens
- [ ] Smooth transitions
- [ ] Good performance
- [ ] All tabs accessible

---

## 📱 Testing on Real Device

### Option A: WiFi Connection (Recommended)
1. Put device and computer on same WiFi network
2. Set EXPO_PUBLIC_API_URL to your computer's local IP
3. Scan QR code in Expo Go
4. Should connect automatically

### Option B: USB Connection (Advanced)
1. Enable USB debugging on device
2. Connect USB cable
3. Run: `adb reverse tcp:3000 tcp:3000`
4. Use localhost in EXPO_PUBLIC_API_URL
5. Scan QR code

### Option C: Tunnel Mode (Slowest but works anywhere)
1. In Expo dev server, press `?` for options
2. Select "Tunnel mode"
3. Works over internet but slower

---

## 📊 Performance Monitoring

### Check Backend Performance
```bash
# Measure prediction latency
time curl -X POST http://127.0.0.1:3000/api/predict \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BANKNIFTY","signal":"BUY"}'

# Should respond in <500ms
```

### Monitor Network in Expo
1. Open Expo menu (Cmd+M on iOS, shake on Android)
2. Enable "Show network inspector"
3. Check request/response times
4. Look for slow endpoints

### Check Memory Usage
1. Open Expo menu
2. Open "Developer Tools"
3. Check performance tab
4. Look for memory leaks

---

## 🌍 Production Testing

### Before Deployment
```bash
# Update .env for production
EXPO_PUBLIC_API_URL=https://nifty-bank-index-f-and-o.onrender.com/api
NODE_ENV=production
LOG_LEVEL=info

# Test production endpoint
curl https://nifty-bank-index-f-and-o.onrender.com/api/healthz

# Rebuild and test
cd artifacts/mobile
pnpm exec expo build:web  # or eas build for native

# Scan production QR code to test
```

---

## 🛠️ Advanced Debugging

### Enable Debug Mode
```bash
# In Expo dev server, press:
# d - Start debugger
# i - iOS simulator
# a - Android emulator
```

### Inspect Network Requests
```bash
# In Chrome DevTools
chrome://inspect

# Or use React Native Debugger
# Download from: https://github.com/jhen0409/react-native-debugger
```

### View Console Logs
```bash
# From Expo dev server terminal
# All console.log() calls from app appear here

# Or use:
adb logcat | grep ReactNativeJS  # Android
log stream --predicate 'process == "ReactNative"'  # macOS
```

---

## 📝 Useful Commands

```bash
# Start everything fresh
cd c:\Trading_APP\NiftyF-O
pnpm clean          # Clear node_modules and build artifacts
pnpm install        # Reinstall all dependencies
node artifacts/api-server/dist/index.mjs  # Start backend

# Clean Expo cache
cd artifacts/mobile
pnpm exec expo start --clear

# Build for testing
pnpm exec expo build:web
pnpm exec eas build --platform ios
pnpm exec eas build --platform android

# Check what env vars are loaded
pnpm exec node -e "console.log(process.env)"
```

---

## ✅ Success Checklist

Before considering testing complete:

- [ ] Backend starts without errors
- [ ] All endpoints return 200 OK
- [ ] Mobile app connects to backend
- [ ] Market data loads in under 2 seconds
- [ ] Options chain displays correctly
- [ ] Prediction endpoint works
- [ ] Signals list shows data
- [ ] No console errors in app
- [ ] No red error screens
- [ ] Smooth performance on device
- [ ] Alice Blue auth works (if configured)
- [ ] All tabs navigate smoothly
- [ ] Production URL switching works

---

## 📚 Resources

- **Full Testing Guide**: See `EXPO_GO_TESTING_GUIDE.md`
- **Production Summary**: See `PRODUCTION_READY_SUMMARY.md`
- **Expo Docs**: https://docs.expo.dev/
- **Alice Blue API**: https://www.aliceblueonline.com/api-docs

---

**Ready to start?** Follow Steps 1-6 above, then run Quick Testing!
