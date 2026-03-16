# Monument Markets Signal Generation Rules

Monument Markets uses a **rule-based signal engine** (no machine learning) to analyze policy data and generate market signals.

---

## Architecture Overview

```
Raw Policy Data
    ↓
Text Extraction (title + summary + description + content)
    ↓
Keyword Matching per Sector
    ↓
Score Calculation (Confidence / Materiality / Urgency)
    ↓
Company Identification
    ↓
Signal Record Created
    ↓
Email Alerts Dispatched
```

---

## Signal Generation Trigger

A signal is generated when **2 or more sector keywords** are found in the combined text of a policy item.

The combined text includes:
- Bill title
- Bill summary
- Legislative description
- Latest action text
- Sponsor names
- Committee names
- News headline + description + content

---

## Sector Rules

### Defense Sector

**Trigger keywords (any 2+ required):**
```
defense, military, dod, department of defense, contract, procurement,
lockheed, northrop, raytheon, boeing, general dynamics, huntington ingalls,
army, navy, air force, marines, pentagon, national security, weapons, missile,
fighter jet, warship, aircraft carrier, l3harris, leidos, defense spending,
ndaa, national defense authorization, armed forces, munitions, cybersecurity
```

**High-impact keywords (boost score):**
```
defense spending, military budget, procurement, ndaa,
national defense authorization, department of defense
```

**Tagged Companies:**
- Lockheed Martin (LMT)
- Northrop Grumman (NOC)
- Raytheon Technologies (RTX)
- Boeing (BA)
- General Dynamics (GD)
- Huntington Ingalls (HII)
- L3Harris Technologies (LHX)
- Leidos (LDOS)

---

### Healthcare Sector

**Trigger keywords (any 2+ required):**
```
healthcare, health care, drug, pharmaceutical, fda, food and drug administration,
medicare, medicaid, insurance, biotech, biotechnology, medical device, pricing,
drug pricing, prescription, clinical trial, approval, health insurance, aca,
affordable care act, cms, centers for medicare, hhs, health and human services,
public health, vaccine, generic drug, biosimilar, copay, deductible, pharmacy
```

**High-impact keywords (boost score):**
```
drug pricing, medicare negotiation, fda approval,
medicaid expansion, affordable care act, health insurance mandate
```

**Tagged Companies:**
- UnitedHealth Group (UNH)
- Anthem (ANTM)
- Aetna (AET)
- Pfizer (PFE)
- Merck (MRK)
- Johnson & Johnson (JNJ)
- Eli Lilly (LLY)
- AbbVie (ABBV)
- Bristol Myers Squibb (BMY)
- Moderna (MRNA)
- CVS Health (CVS)
- Cigna (CI)

---

### Energy Sector

**Trigger keywords (any 2+ required):**
```
energy, oil, gas, natural gas, renewable, solar, wind, subsidy, fossil fuel,
climate, carbon, epa, environmental protection agency, clean energy, green energy,
electric vehicle, ev, nuclear, coal, petroleum, pipeline, lng,
liquefied natural gas, emissions, greenhouse gas, net zero, paris agreement,
inflation reduction act, ira tax credit, utility, electricity, grid,
offshore wind, hydropower
```

**High-impact keywords (boost score):**
```
energy subsidy, oil production, renewable energy mandate, carbon tax,
epa regulation, clean energy standard, fossil fuel ban, inflation reduction act
```

**Tagged Companies:**
- ExxonMobil (XOM)
- Chevron (CVX)
- ConocoPhillips (COP)
- NextEra Energy (NEE)
- Duke Energy (DUK)
- American Electric Power (AEP)
- Dominion Energy (D)
- FirstEnergy (FE)
- Sempra Energy (SRE)
- NRG Energy (NRG)

---

## Scoring Methodology

### Confidence Score (1–10)

Measures how strongly the policy content matches the sector.

```
confidence = min(keywordCount / 3 × 4, 6) + min(highImpactMatches × 1.5, 4)
```

- **1–3**: Weak match — low keyword density, no high-impact terms
- **4–6**: Moderate match — multiple keywords, possible sector connection
- **7–10**: Strong match — high-impact terms present, dense keyword signals

### Materiality Score (1–10)

Estimates the potential market impact on sector stocks.

```
base = sectorBase + highImpactBonus + sourceBonus

sectorBase: defense=5, healthcare=5, energy=4
highImpactBonus: min(highImpactCount × 1.5, 3)
sourceBonus: congress=+1, sec=+0.5, news=+0
```

Higher materiality = larger potential price impact on tagged companies.

### Urgency Score (1–10)

Measures time-sensitivity of the signal.

| Urgency Level | Trigger Terms |
|---------------|---------------|
| High (8–10) | emergency, immediate, urgent, executive order, signed into law |
| Medium (5–7) | vote, passed, enacted, effective, deadline, expires |
| Low (2–4) | proposed, introduced, draft, discussion, committee |

News articles receive +1 urgency vs. Congressional records (more current).

---

## Company Identification

When a signal is generated for a sector:

1. The system checks if any company-specific keywords appear in the text
2. If specific companies are mentioned → only those companies are tagged
3. If no specific companies are mentioned → **all companies in that sector are tagged** (sector-wide policy impacts all players)

**Company keywords** include company names, ticker symbols, brand names, and subsidiary names. For example, Boeing is matched by: `boeing`, `ba`, `f/a-18`, `fa-18`.

---

## Data Sources

| Source | Frequency | What's Ingested |
|--------|-----------|-----------------|
| Congress.gov API | Every 6 hours | Bills, amendments, summaries, sponsors, committees |
| SEC EDGAR | Daily (2 AM) | 8-K, 10-K filings for policy-relevant terms |
| NewsAPI | Every hour | Policy news, business headlines |

---

## False Positive Handling

The minimum threshold of 2 keyword matches helps filter noise. A minimum confidence score of 2 is required before a signal is saved to the database.

Items that are known false-positive risks:
- Generic financial news (matched if it mentions a company but no policy terms)
- Sports/entertainment mentions of company names (mitigated by requiring multiple keyword matches)

Future improvements could include: entity recognition (NLP), sentiment analysis, and ML-based relevance scoring.
