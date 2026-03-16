# Monument Markets

**Policy Intelligence Platform for Institutional Investors**

Monument Markets automatically analyzes government policy activity (legislation, regulatory changes, federal spending) and converts it into structured market signals. Institutional investors use these signals to identify companies and sectors likely to be impacted by policy changes before the market fully reacts.

## Sectors Covered

- **Defense** — DoD contracts, NDAA, military procurement, defense spending bills
- **Healthcare** — Drug pricing legislation, FDA approvals, Medicare/Medicaid policy
- **Energy** — EPA regulations, energy subsidies, climate policy, fossil fuel legislation

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Node.js + Express |
| Database | PostgreSQL |
| Auth | JWT + bcrypt |
| Email | Nodemailer |
| Logging | Winston |
| Frontend Hosting | Vercel |
| Backend Hosting | Heroku / AWS |

---

## Quick Start (Local Development)

### Prerequisites

- Node.js >= 18
- PostgreSQL running locally

### 1. Clone and install

```bash
git clone <repo>
cd Monument-Markets

# Install backend deps
cd backend && npm install

# Install frontend deps
cd ../frontend && npm install
```

### 2. Configure environment

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env with your DATABASE_URL, JWT_SECRET, and API keys

# Frontend
cp frontend/.env.example frontend/.env
# Frontend .env can stay empty for local dev (uses Vite proxy)
```

### 3. Set up the database

```bash
# Make sure PostgreSQL is running, then:
cd backend
npm run migrate
# Or migrations run automatically on server start
```

### 4. Start both servers

```bash
# Terminal 1: Backend (port 3001)
cd backend && npm run dev

# Terminal 2: Frontend (port 5173)
cd frontend && npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### 5. Ingest data (development)

After logging in, click **"Ingest Data"** on the dashboard, or:

```bash
curl -X POST http://localhost:3001/admin/ingest
```

---

## Project Structure

```
Monument-Markets/
├── backend/
│   ├── src/
│   │   ├── config/         # DB connection, migrations, sector rules
│   │   ├── controllers/    # Route handlers (auth, signals, alerts)
│   │   ├── middleware/     # JWT auth, request logger, error handler
│   │   ├── routes/         # Express routers
│   │   ├── services/
│   │   │   ├── ingestion/  # Congress.gov, SEC, NewsAPI clients
│   │   │   ├── signalEngine.js   # Rule-based signal generation
│   │   │   ├── scheduler.js      # Cron jobs
│   │   │   └── emailService.js   # Alert emails
│   │   ├── utils/          # Logger, retry helper
│   │   └── server.js       # App entry point
│   ├── logs/               # Winston log files
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/     # SignalCard, FilterBar, StatsPanel, etc.
│   │   ├── context/        # AuthContext (JWT state)
│   │   ├── pages/          # Dashboard, Login, Signup, Alerts, SignalDetail
│   │   ├── services/       # API client (fetch wrapper)
│   │   └── App.jsx
│   ├── vercel.json
│   └── package.json
└── docs/
    ├── API_DOCS.md
    ├── DEPLOYMENT.md
    ├── SIGNAL_RULES.md
    └── USER_GUIDE.md
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Secret for signing JWT tokens (min 32 chars) |
| `CONGRESS_API_KEY` | Optional | [congress.gov/sign-up](https://api.congress.gov/) |
| `NEWS_API_KEY` | Optional | [newsapi.org](https://newsapi.org/) |
| `EMAIL_HOST` | Optional | SMTP host (e.g., smtp.gmail.com) |
| `EMAIL_PORT` | Optional | SMTP port (587) |
| `EMAIL_USER` | Optional | SMTP username |
| `EMAIL_PASS` | Optional | SMTP password / app password |
| `EMAIL_FROM` | Optional | From address for alerts |
| `FRONTEND_URL` | Optional | CORS origin (default: http://localhost:5173) |
| `PORT` | Optional | Server port (default: 3001) |
| `NODE_ENV` | Optional | `development` or `production` |

---

## Documentation

- [API Documentation](docs/API_DOCS.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Signal Generation Rules](docs/SIGNAL_RULES.md)
- [User Guide](docs/USER_GUIDE.md)
