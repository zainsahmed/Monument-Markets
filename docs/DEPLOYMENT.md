# Monument Markets Deployment Guide

## Overview

| Component | Platform | Notes |
|-----------|----------|-------|
| Frontend | Vercel | Static React/Vite build |
| Backend | Heroku or AWS | Node.js Express server |
| Database | Heroku Postgres or AWS RDS | PostgreSQL |

---

## 1. Database Setup

### Heroku Postgres

```bash
heroku addons:create heroku-postgresql:mini -a your-backend-app
heroku config:get DATABASE_URL -a your-backend-app
```

### AWS RDS

1. Create PostgreSQL instance in AWS RDS console
2. Note the connection string: `postgresql://user:pass@host:5432/dbname`
3. Ensure security group allows inbound on port 5432 from your backend

---

## 2. Backend Deployment (Heroku)

### Initial Setup

```bash
# Install Heroku CLI
brew install heroku/brew/heroku  # macOS
# or: https://devcenter.heroku.com/articles/heroku-cli

# Login
heroku login

# Create app
heroku create your-monument-markets-api

# Add Postgres
heroku addons:create heroku-postgresql:mini

# Set environment variables
heroku config:set JWT_SECRET="your-super-secret-jwt-key-min-32-chars"
heroku config:set CONGRESS_API_KEY="your_congress_key"
heroku config:set NEWS_API_KEY="your_newsapi_key"
heroku config:set EMAIL_HOST="smtp.gmail.com"
heroku config:set EMAIL_PORT="587"
heroku config:set EMAIL_USER="alerts@yourdomain.com"
heroku config:set EMAIL_PASS="your-gmail-app-password"
heroku config:set EMAIL_FROM="Monument Markets <alerts@yourdomain.com>"
heroku config:set FRONTEND_URL="https://your-frontend.vercel.app"
heroku config:set NODE_ENV="production"
```

### Deploy

```bash
cd Monument-Markets/backend

# Initialize git (if needed)
git init
git add .
git commit -m "Initial backend deployment"

# Add Heroku remote
heroku git:remote -a your-monument-markets-api

# Deploy
git push heroku main

# View logs
heroku logs --tail
```

The Procfile handles the start command: `web: node src/server.js`

### AWS Lambda (Alternative)

For serverless deployment, use `serverless-express`:

```bash
npm install @vendia/serverless-express
```

Create `lambda.js`:
```javascript
const serverlessExpress = require('@vendia/serverless-express');
const app = require('./src/server');
exports.handler = serverlessExpress({ app });
```

---

## 3. Frontend Deployment (Vercel)

### Via Vercel CLI

```bash
npm install -g vercel

cd Monument-Markets/frontend

# Set environment variable for production
echo "VITE_API_URL=https://your-monument-markets-api.herokuapp.com" > .env.production

# Build and deploy
vercel --prod
```

### Via Vercel Dashboard

1. Go to [vercel.com](https://vercel.com) → Import Project
2. Select your GitHub repository
3. Set **Root Directory** to `frontend`
4. Add Environment Variable:
   - `VITE_API_URL` = `https://your-backend.herokuapp.com`
5. Deploy

**Build Settings:**
- Framework: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

The `vercel.json` handles SPA routing (rewrites all paths to `index.html`).

---

## 4. Environment Variables Reference

### Backend (Required for Production)

```bash
DATABASE_URL=postgresql://user:pass@host:5432/monument_markets
JWT_SECRET=min-32-char-random-string-here
NODE_ENV=production
FRONTEND_URL=https://your-app.vercel.app
```

### Backend (Optional — enables features)

```bash
# Data ingestion
CONGRESS_API_KEY=your_key    # Free: api.congress.gov
NEWS_API_KEY=your_key        # Free tier: newsapi.org

# Email alerts
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your@gmail.com
EMAIL_PASS=your-app-password  # Gmail: Settings > Security > App passwords
EMAIL_FROM=Monument Markets <your@gmail.com>
```

### Frontend

```bash
VITE_API_URL=https://your-backend.herokuapp.com
```

---

## 5. Post-Deployment Checklist

- [ ] Visit `/health` endpoint to verify backend is running
- [ ] Create a user account and confirm login works
- [ ] Trigger ingestion via dashboard (dev) or wait for first cron run
- [ ] Verify signals appear in dashboard
- [ ] Test CSV/JSON export
- [ ] Confirm email alerts deliver (send a test signal)
- [ ] Check Heroku logs for any errors

---

## 6. Monitoring

```bash
# View backend logs
heroku logs --tail -a your-monument-markets-api

# View log files (if using file transport)
heroku run cat logs/error.log -a your-monument-markets-api
```

Log files on the server (path: `backend/logs/`):
- `combined.log` — All logs
- `error.log` — Errors only
- `ingestion.log` — Data ingestion events
