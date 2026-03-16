# Monument Markets User Guide

## Getting Started

### Creating an Account

1. Navigate to the app URL
2. Click **"Create one"** on the login page
3. Enter your email and a password (min. 8 characters)
4. You're logged in automatically

### Logging In

1. Go to the login page
2. Enter your email and password
3. Your session lasts 24 hours — the app will prompt you to re-login when it expires

---

## Dashboard

The main dashboard shows the **Policy Signal Feed** — a real-time stream of policy signals sorted newest first.

### Signal Cards

Each card shows:

| Field | Description |
|-------|-------------|
| **Sector badge** | Defense (blue), Healthcare (green), Energy (amber) |
| **Source** | Where the signal came from: Congress.gov, SEC, or News |
| **Timestamp** | How long ago the signal was created |
| **Title** | Summary of the policy activity |
| **Description** | Detailed analysis of the policy content |
| **Affected Companies** | Companies likely impacted |
| **Confidence** | How strongly the text matches the sector (1–10) |
| **Materiality** | Estimated market impact (1–10) |
| **Urgency** | Time-sensitivity (1–10) |

Click any signal card to see the full detail view.

---

## Filtering Signals

Use the **filter bar** above the signal feed to narrow results.

### Filter by Company

Type a company name in the search box. The filter finds signals that mention that company.

Example: Type `Lockheed` to see only Lockheed Martin signals.

### Filter by Sector

Select from the dropdown:
- **All Sectors** (default)
- **Defense**
- **Healthcare**
- **Energy**

### Filter by Date Range

Set a start and/or end date to see signals from a specific time window.

### Sort Order

- **Newest First** (default) — Latest signals at the top
- **Oldest First** — Oldest signals at the top

### Clear Filters

Click the **Clear** button to reset all filters.

---

## Viewing Signal Details

Click **"View full signal"** or the signal title to open the detail page.

The detail page shows:
- Full signal title and description
- Score gauges for Confidence, Materiality, and Urgency
- Complete list of affected companies (click a company to filter by it)
- Link to the original source (bill, filing, or article)
- Raw source data

Use the back button to return to the feed.

---

## Exporting Data

Click the **Export** button in the top-right of the dashboard.

### CSV Export

Downloads a `.csv` file with columns:
- Signal ID, Title, Description, Affected Companies, Sector
- Confidence, Materiality, Urgency (each 1–10)
- Source, Source URL, Timestamp

Open in Excel, Google Sheets, or any spreadsheet tool.

### JSON Export

Downloads a `.json` file with full signal objects including all metadata.

### Exporting Filtered Data

Apply filters first, then export — the export respects your active filters.

---

## Email Alerts

Set up email notifications so you're alerted when new policy signals match your interests.

### Setting Up Alerts

1. Click **"Alert Preferences"** in the navigation
2. Select one or more **sectors** to alert on
3. Select specific **companies** you want to track
4. Click **"Save Preferences"**

### How Alerts Work

- You receive an email whenever a new signal is generated that matches your preferences
- If you select no sectors and no companies → you receive alerts for **all** new signals
- Emails include: signal title, scores, affected companies, and a link to view the full signal

### Updating Preferences

Return to Alert Preferences at any time and save new selections.

### Disabling Alerts

Click **"Clear"** on the Alert Preferences page to deactivate all alerts.

---

## Data Refresh

The system automatically ingests new data:

| Source | Frequency |
|--------|-----------|
| NewsAPI | Every hour |
| Congress.gov | Every 6 hours |
| SEC EDGAR | Daily at 2 AM |

Click **Refresh** on the dashboard to reload the latest signals from the database.

In development mode, you can also click **"Ingest Data"** to manually trigger a data pull.

---

## Understanding Signal Scores

### Confidence (1–10)

How strongly the source text matches the sector. Higher = more keywords matched.

- **1–3**: Weak — may be tangential
- **4–6**: Moderate — clear sector relevance
- **7–10**: Strong — explicit sector language

### Materiality (1–10)

The estimated size of the market impact on affected companies.

- Congressional legislation scores higher than news articles
- Bills mentioning specific spending amounts score higher

### Urgency (1–10)

How time-sensitive the signal is.

- **Signed laws**: 8–10
- **Passed votes**: 6–7
- **Proposed bills**: 3–4

---

## Tips for Power Users

1. **Daily routine**: Filter by sector → Sort by newest → Review high-urgency signals
2. **Company research**: Search a specific company to see all policy exposure
3. **Export for analysis**: Export filtered data to run your own analysis
4. **Alert on specifics**: Set alerts for specific portfolio companies rather than entire sectors to reduce noise
5. **Source links**: Click the external link icon on any signal to read the primary source
