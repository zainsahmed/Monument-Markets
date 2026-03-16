# Monument Markets API Documentation

Base URL: `http://localhost:3001` (development)

All endpoints except `/auth/signup`, `/auth/login`, and `/health` require a valid JWT token in the `Authorization` header:

```
Authorization: Bearer <token>
```

---

## Authentication

### POST /auth/signup

Register a new user account.

**Request Body:**
```json
{
  "email": "investor@example.com",
  "password": "SecurePass123"
}
```

**Response 201:**
```json
{
  "message": "Account created successfully",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "investor@example.com",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Errors:** 400 (validation), 409 (email exists)

---

### POST /auth/login

Login and receive a JWT token.

**Request Body:**
```json
{
  "email": "investor@example.com",
  "password": "SecurePass123"
}
```

**Response 200:**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "investor@example.com"
  }
}
```

**Errors:** 400 (missing fields), 401 (invalid credentials)

---

### GET /auth/me

Get the current authenticated user.

**Response 200:**
```json
{
  "id": "uuid",
  "email": "investor@example.com",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

---

## Signals

### GET /api/signals

Get a paginated list of policy signals with optional filtering.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `sector` | string | — | Filter by sector: `defense`, `healthcare`, `energy` |
| `company` | string | — | Filter by company name (exact match) |
| `startDate` | ISO date | — | Filter signals after this date |
| `endDate` | ISO date | — | Filter signals before this date |
| `limit` | integer | 50 | Results per page (max 500) |
| `offset` | integer | 0 | Pagination offset |
| `sort` | string | `newest` | Sort order: `newest` or `oldest` |

**Example:**
```
GET /api/signals?sector=defense&limit=20&offset=0
```

**Response 200:**
```json
{
  "signals": [
    {
      "id": "uuid",
      "title": "NDAA Amendment Increases Defense Procurement Budget by $12B",
      "description": "A key amendment to the National Defense Authorization Act...",
      "affected_companies": ["Lockheed Martin", "Northrop Grumman", "Raytheon Technologies"],
      "sector": "defense",
      "confidence": 8,
      "materiality": 9,
      "urgency": 7,
      "source": "congress",
      "source_url": "https://www.congress.gov/bill/...",
      "created_at": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 142,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

---

### GET /api/signals/:id

Get a single signal with full details including raw source data.

**Response 200:**
```json
{
  "id": "uuid",
  "title": "...",
  "description": "...",
  "affected_companies": [...],
  "sector": "defense",
  "confidence": 8,
  "materiality": 9,
  "urgency": 7,
  "source": "congress",
  "source_url": "https://...",
  "raw_data": { ... },
  "created_at": "2024-01-15T10:30:00.000Z"
}
```

**Errors:** 404 (signal not found)

---

### GET /api/signals/stats

Get aggregate statistics across all signals.

**Response 200:**
```json
{
  "bySector": [
    {
      "sector": "defense",
      "count": "87",
      "avg_confidence": "6.8",
      "avg_materiality": "7.1",
      "latest_signal": "2024-01-15T10:30:00.000Z"
    }
  ],
  "recentActivity": [
    {
      "date": "2024-01-15T00:00:00.000Z",
      "sector": "defense",
      "count": "12"
    }
  ],
  "bySources": [
    { "source": "congress", "count": "54" },
    { "source": "news", "count": "33" }
  ],
  "totalSignals": 142
}
```

---

### GET /api/signals/export

Export signals as CSV or JSON file download.

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `format` | string | ✅ | `csv` or `json` |
| `sector` | string | — | Filter by sector |
| `company` | string | — | Filter by company |
| `startDate` | ISO date | — | Start date filter |
| `endDate` | ISO date | — | End date filter |

**CSV Format:**
```
Signal ID,Title,Description,Affected Companies,Sector,Confidence (1-10),Materiality (1-10),Urgency (1-10),Source,Source URL,Timestamp
```

**JSON Format:**
```json
{
  "exportedAt": "2024-01-15T10:30:00.000Z",
  "totalRecords": 87,
  "filters": { "sector": "defense" },
  "signals": [...]
}
```

---

## Alerts

### POST /api/alerts/subscribe

Create or update email alert subscription.

**Request Body:**
```json
{
  "sectors": ["defense", "healthcare"],
  "companies": ["Lockheed Martin", "Pfizer"]
}
```

- Empty arrays = receive alerts for all sectors/companies
- Sector values: `defense`, `healthcare`, `energy`

**Response 201/200:**
```json
{
  "message": "Alert preferences saved successfully",
  "alert": {
    "id": "uuid",
    "user_id": "uuid",
    "sectors": ["defense", "healthcare"],
    "companies": ["Lockheed Martin", "Pfizer"],
    "is_active": true,
    "created_at": "2024-01-15T10:30:00.000Z",
    "updated_at": "2024-01-15T10:30:00.000Z"
  }
}
```

---

### GET /api/alerts

Get the current user's alert subscriptions.

**Response 200:**
```json
{
  "alerts": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "sectors": ["defense"],
      "companies": [],
      "is_active": true,
      "created_at": "2024-01-15T10:30:00.000Z",
      "updated_at": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

---

### DELETE /api/alerts/:id

Deactivate an alert subscription.

**Response 200:**
```json
{ "message": "Alert subscription deactivated" }
```

---

## System

### GET /health

Health check endpoint (no auth required).

**Response 200:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "database": "connected",
  "version": "1.0.0"
}
```

### POST /admin/ingest

Trigger manual data ingestion (development only, disabled in production).

**Response 200:**
```json
{ "message": "Ingestion started asynchronously" }
```

---

## Error Format

All errors return consistent JSON:

```json
{
  "error": "Error Type",
  "message": "Human-readable description"
}
```

**Common HTTP Status Codes:**

| Code | Meaning |
|------|---------|
| 400 | Bad Request — Invalid input |
| 401 | Unauthorized — Missing or invalid JWT |
| 403 | Forbidden — Insufficient permissions |
| 404 | Not Found — Resource doesn't exist |
| 409 | Conflict — Duplicate resource |
| 429 | Too Many Requests — Rate limited |
| 500 | Internal Server Error — Unexpected error |
