# Configuration Guide - Environment Variables & Setup

## 🎯 Quick Environment Setup

### Step 1: Find Your Local IP

**Windows (Command Prompt)**:
```bash
ipconfig
# Copy the "IPv4 Address" (e.g., 192.168.1.10)
```

**macOS/Linux (Terminal)**:
```bash
ifconfig
# Copy the inet address for your active interface
```

---

## 🔧 Development Configuration (.env.local)

```bash
# ============================================================================
# MOBILE APP - MOST IMPORTANT
# ============================================================================

# Replace 192.168.1.10 with YOUR LOCAL IP from Step 1 above
EXPO_PUBLIC_API_URL=http://192.168.1.10:3000/api

# ============================================================================
# PYTHON MODEL SERVICE
# ============================================================================

# Local development (default)
PYTHON_SERVICE_URL=http://127.0.0.1:8000

# Production (replace with real URL)
# PYTHON_SERVICE_URL=https://your-python-service.example.com

# ============================================================================
# ENVIRONMENT
# ============================================================================

NODE_ENV=development
LOG_LEVEL=debug

# ============================================================================
# ALICE BLUE BROKER (Optional - only if testing auth)
# ============================================================================

ALICE_ENABLED=true
ALICE_API_KEY=W6329sgnmx
ALICE_API_SECRET=6TxaOUsKyjhhHo6MokD4qgfQfcdViTMg6rT5CZilA5rxGcG6tUhOdWfIN88s7cH8KiM34vCXw2LwLJ7GszK1HrBRWdmYSVj1h026
ALICE_USER_ID=1902101

# Alice Blue auth code (from login flow)
# ALICE_AUTH_CODE=your_auth_code_here

# ============================================================================
# BACKEND SERVER
# ============================================================================

PORT=3000
HOST=0.0.0.0

# ============================================================================
```

---

## 🚀 Production Configuration

### Option 1: Render Dashboard

Go to: `https://render.com/dashboard`

Set these environment variables:

```
EXPO_PUBLIC_API_URL=https://nifty-bank-index-f-and-o.onrender.com/api
PYTHON_SERVICE_URL=https://your-python-service.example.com
NODE_ENV=production
LOG_LEVEL=info
ALICE_ENABLED=true
ALICE_FRONTEND_REDIRECT_URL=https://nifty-bank-index-f-and-o.onrender.com/callback
```

### Option 2: Docker/Local VPS

Create `.env.production`:

```bash
NODE_ENV=production
LOG_LEVEL=info
PORT=5000
HOST=0.0.0.0

# Backend URLs
PYTHON_SERVICE_URL=https://ml-service.example.com

# Alice Blue
ALICE_ENABLED=true
ALICE_FRONTEND_REDIRECT_URL=https://your-domain.com/callback
```

---

## 🔑 Environment Variables Reference

### Required Variables

| Variable | Example | Purpose |
|----------|---------|---------|
| `EXPO_PUBLIC_API_URL` | `http://192.168.1.10:3000/api` | Mobile app backend URL |
| `NODE_ENV` | `development` or `production` | Application environment |

### Optional Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PYTHON_SERVICE_URL` | `http://127.0.0.1:8000` | ML model service |
| `LOG_LEVEL` | `info` | Logging detail level |
| `PORT` | `3000` | Backend server port |
| `HOST` | `0.0.0.0` | Backend server host |
| `ALICE_ENABLED` | `false` | Enable Alice Blue broker |
| `ALICE_AUTH_CODE` | undefined | Alice Blue auth code |

### Alice Blue Variables (if enabling)

| Variable | Example | Purpose |
|----------|---------|---------|
| `ALICE_API_KEY` | `W6329sgnmx` | Broker API key |
| `ALICE_API_SECRET` | `6TxaOUsk...` | Broker API secret |
| `ALICE_USER_ID` | `1902101` | Broker user ID |
| `ALICE_PASSWORD` | `your_password` | Broker password (optional) |
| `ALICE_FRONTEND_REDIRECT_URL` | `http://localhost:5000` | OAuth callback URL |

---

## 📝 Configuration Files Location

```
c:\Trading_APP\NiftyF-O\
├── .env.local                              # Your local config (never commit!)
├── .env.example                            # Template (commit this)
├── lib/broker-config.ts                    # Loads env vars
├── artifacts/mobile/constants/apiConfig.ts # Uses env vars
└── artifacts/api-server/src/app.ts         # Uses env vars
```

---

## ✅ Configuration Checklist

### For Local Development

- [ ] Find your local IP address
- [ ] Update `.env.local` with your IP in `EXPO_PUBLIC_API_URL`
- [ ] Set `EXPO_PUBLIC_API_URL=http://YOUR_IP:3000/api`
- [ ] Verify backend runs on port 3000
- [ ] Verify Expo can connect to backend
- [ ] Test API endpoints respond
- [ ] Test mobile app loads data

### For Production

- [ ] Set `NODE_ENV=production`
- [ ] Set `LOG_LEVEL=info`
- [ ] Set `EXPO_PUBLIC_API_URL` to production Render URL
- [ ] Configure `PYTHON_SERVICE_URL` for production ML service
- [ ] Set `ALICE_FRONTEND_REDIRECT_URL` to production domain
- [ ] Configure all `ALICE_*` variables
- [ ] Test in staging environment
- [ ] Deploy to production
- [ ] Verify all endpoints working
- [ ] Monitor logs and performance

---

## 🧪 Configuration Validation

### Test Development Config

```bash
# Verify backend responds
curl http://127.0.0.1:3000/api/healthz

# Verify mobile app can reach backend
# (from Expo Go on your mobile device)
# Should load market data within 2 seconds

# Check env vars are loaded
node -e "console.log(process.env.EXPO_PUBLIC_API_URL)"
```

### Test Production Config

```bash
# Verify production backend responds
curl https://nifty-bank-index-f-and-o.onrender.com/api/healthz

# Check SSL certificate is valid
curl -v https://nifty-bank-index-f-and-o.onrender.com/api/healthz

# Test from mobile in production:
# Set EXPO_PUBLIC_API_URL to production URL
# Rebuild and test in Expo Go
```

---

## 🔐 Security Best Practices

### DO's ✅
- [x] Store credentials in `.env.local` (never commit)
- [x] Use environment variables for all secrets
- [x] Use HTTPS for production
- [x] Use strong passwords for Alice Blue
- [x] Rotate auth codes regularly
- [x] Monitor API logs for suspicious activity
- [x] Use rate limiting on production APIs
- [x] Backup credentials in secure location

### DON'Ts ❌
- [ ] Never commit `.env.local` to git
- [ ] Never hardcode credentials in code
- [ ] Never use localhost in production config
- [ ] Never share `.env` files
- [ ] Never log sensitive credentials
- [ ] Never use HTTP in production
- [ ] Never use same credentials for dev/prod

---

## 🚀 Quick Start Commands

### Start Everything

```bash
# Terminal 1: Backend
cd c:\Trading_APP\NiftyF-O
node artifacts/api-server/dist/index.mjs

# Terminal 2: Verify backend
curl http://127.0.0.1:3000/api/healthz

# Terminal 3: Mobile dev server
cd artifacts/mobile
pnpm exec expo start

# Then: Scan QR code in Expo Go on your device
```

### Build Commands

```bash
# Development build
pnpm install
pnpm run build

# Production build
NODE_ENV=production pnpm run build

# Expo build
cd artifacts/mobile
pnpm exec expo build:web
pnpm exec eas build --platform ios
pnpm exec eas build --platform android
```

---

## 📊 Example Configurations

### Example 1: Local Development (Windows)

```bash
# .env.local
EXPO_PUBLIC_API_URL=http://192.168.1.10:3000/api
PYTHON_SERVICE_URL=http://127.0.0.1:8000
NODE_ENV=development
LOG_LEVEL=debug
ALICE_ENABLED=true
```

### Example 2: Local Development (macOS)

```bash
# .env.local
EXPO_PUBLIC_API_URL=http://10.0.0.5:3000/api
PYTHON_SERVICE_URL=http://127.0.0.1:8000
NODE_ENV=development
LOG_LEVEL=debug
ALICE_ENABLED=true
```

### Example 3: Production (Render)

```bash
# Set in Render Dashboard
EXPO_PUBLIC_API_URL=https://nifty-bank-index-f-and-o.onrender.com/api
PYTHON_SERVICE_URL=https://python-ml.render.com
NODE_ENV=production
LOG_LEVEL=info
ALICE_ENABLED=true
ALICE_FRONTEND_REDIRECT_URL=https://nifty-bank-index-f-and-o.onrender.com/callback
```

### Example 4: Testing with Mock Data

```bash
# .env.local for testing without broker
EXPO_PUBLIC_API_URL=http://192.168.1.10:3000/api
PYTHON_SERVICE_URL=http://127.0.0.1:8000
NODE_ENV=development
LOG_LEVEL=debug
ALICE_ENABLED=false  # Disable broker, use synthetic data
```

---

## 🔗 URLs Reference

| Service | Development | Production |
|---------|-------------|------------|
| Backend | `http://127.0.0.1:3000` | `https://nifty-bank-index-f-and-o.onrender.com` |
| Mobile API | `http://YOUR_IP:3000/api` | `https://nifty-bank-index-f-and-o.onrender.com/api` |
| Python ML | `http://127.0.0.1:8000` | `https://python-ml.example.com` |
| Alice Blue OAuth | `https://www.aliceblueonline.com/oauth` | `https://www.aliceblueonline.com/oauth` |

---

## 📞 Troubleshooting Configuration

### Mobile app says "Cannot connect to API"

1. Check `.env.local` has correct IP:
   ```bash
   cat .env.local | grep EXPO_PUBLIC_API_URL
   ```

2. Verify backend is running:
   ```bash
   curl http://127.0.0.1:3000/api/healthz
   ```

3. Verify you're on same network as backend

4. Try IP instead of localhost (mobile can't reach host localhost)

### Backend not starting

1. Check port 3000 is free:
   ```bash
   netstat -ano | findstr :3000  # Windows
   lsof -i :3000                 # macOS
   ```

2. Kill existing process if needed

3. Check .env.local syntax (no quotes needed)

### Python service not responding

1. Verify Python service is running on port 8000

2. Check `PYTHON_SERVICE_URL` is correct in `.env.local`

3. If no Python service, backend uses synthetic data automatically

---

## ✅ Final Verification

Run this to verify configuration:

```bash
# Check env vars loaded correctly
node -e "
const vars = ['NODE_ENV', 'EXPO_PUBLIC_API_URL', 'PYTHON_SERVICE_URL'];
vars.forEach(v => console.log(v + '=' + process.env[v]));
"

# Should output:
# NODE_ENV=development
# EXPO_PUBLIC_API_URL=http://192.168.1.10:3000/api
# PYTHON_SERVICE_URL=http://127.0.0.1:8000
```

---

**Need Help?** See:
- `QUICK_START_TESTING.md` - Quick setup guide
- `EXPO_GO_TESTING_GUIDE.md` - Complete testing guide
- `PRODUCTION_READY_SUMMARY.md` - Production deployment guide
- `API_REFERENCE_GUIDE.md` - API endpoint documentation

---

**Configuration Complete!** Ready to start development and testing.
