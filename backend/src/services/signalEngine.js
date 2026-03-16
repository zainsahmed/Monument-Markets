const { SECTORS } = require('../config/sectors');
const { query } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Rule-based signal generation engine
 * Analyzes policy data and generates market signals for institutional investors
 */

/**
 * Count keyword matches in text (case-insensitive)
 */
function countKeywordMatches(text, keywords) {
  if (!text) return { count: 0, matched: [] };
  const lowerText = text.toLowerCase();
  const matched = keywords.filter((kw) => lowerText.includes(kw.toLowerCase()));
  return { count: matched.length, matched };
}

/**
 * Identify which companies are affected based on text content
 */
function identifyAffectedCompanies(text, sectorConfig) {
  if (!text) return [];
  const lowerText = text.toLowerCase();
  const affected = [];

  for (const company of sectorConfig.companies) {
    const companyKws = sectorConfig.companyKeywords[company.name] || [company.name.toLowerCase()];
    const isAffected = companyKws.some((kw) => lowerText.includes(kw.toLowerCase()));
    if (isAffected) {
      affected.push(company.name);
    }
  }

  // If no specific companies matched, return all companies in the sector
  // (sector-wide policy impacts all major players)
  if (affected.length === 0) {
    return sectorConfig.companies.map((c) => c.name);
  }

  return affected;
}

/**
 * Calculate confidence score (1-10) based on keyword match strength
 */
function calculateConfidence(keywordMatches, highImpactMatches, totalKeywords) {
  if (keywordMatches === 0) return 0;

  // Base score from keyword density
  const densityScore = Math.min((keywordMatches / 3) * 4, 6); // Max 6 from density

  // Bonus for high-impact keywords
  const highImpactBonus = Math.min(highImpactMatches * 1.5, 4); // Max 4 from high-impact

  const score = Math.round(densityScore + highImpactBonus);
  return Math.max(1, Math.min(10, score));
}

/**
 * Calculate materiality score (1-10) based on estimated market impact
 */
function calculateMateriality(sector, keywordCount, highImpactCount, source) {
  // Base materiality by sector (defense tends to have high dollar amounts)
  const sectorBase = { defense: 5, healthcare: 5, energy: 4 };
  let base = sectorBase[sector] || 4;

  // Adjust for high-impact keywords
  base += Math.min(highImpactCount * 1.5, 3);

  // Source credibility adjustment
  if (source === 'congress') base += 1; // Legislative = higher certainty
  if (source === 'sec') base += 0.5;

  return Math.max(1, Math.min(10, Math.round(base)));
}

/**
 * Calculate urgency score (1-10) based on time-sensitivity
 */
function calculateUrgency(text, source) {
  if (!text) return 3;
  const lowerText = text.toLowerCase();

  let urgency = 3; // Default low-medium

  // Urgency indicators
  const highUrgencyTerms = ['emergency', 'immediate', 'urgent', 'executive order', 'signed into law'];
  const medUrgencyTerms = ['vote', 'passed', 'enacted', 'effective', 'deadline', 'expires'];
  const lowUrgencyTerms = ['proposed', 'introduced', 'draft', 'discussion', 'committee'];

  if (highUrgencyTerms.some((t) => lowerText.includes(t))) urgency = Math.max(urgency, 8);
  else if (medUrgencyTerms.some((t) => lowerText.includes(t))) urgency = Math.max(urgency, 6);
  else if (lowUrgencyTerms.some((t) => lowerText.includes(t))) urgency = Math.max(urgency, 3);

  // News = more timely than SEC filings
  if (source === 'news') urgency = Math.min(urgency + 1, 10);

  return Math.max(1, Math.min(10, urgency));
}

/**
 * Generate a signal title from text content
 */
function generateSignalTitle(text, sector, source) {
  // Truncate to first sentence or 100 chars
  const firstSentence = (text || '').split(/[.!?]/)[0].trim();
  const title =
    firstSentence.length > 120
      ? firstSentence.substring(0, 120) + '...'
      : firstSentence || `${sector} Policy Signal`;

  return title.charAt(0).toUpperCase() + title.slice(1);
}

/**
 * Generate signal description
 */
function generateDescription(rawData, sector, matchedKeywords) {
  const sectorConfig = SECTORS[sector];
  const sectorName = sectorConfig.name;

  let description = '';

  if (rawData.summary) {
    description = rawData.summary;
  } else if (rawData.description) {
    description = rawData.description;
  } else if (rawData.content) {
    // Take first 500 chars of content
    description = (rawData.content || '').substring(0, 500);
    if (rawData.content.length > 500) description += '...';
  } else if (rawData.title) {
    description = `${sectorName} sector policy activity detected: ${rawData.title}`;
  }

  if (matchedKeywords.length > 0) {
    const kwList = matchedKeywords.slice(0, 5).join(', ');
    description += `\n\nKey policy terms detected: ${kwList}.`;
  }

  return description || `${sectorName} sector policy activity requiring investor attention.`;
}

/**
 * Analyze a piece of raw policy data and generate signals if applicable
 */
async function analyzeForSignals(rawDataId, source, data) {
  const signals = [];

  // Combine all text fields for analysis
  const textContent = [
    data.title,
    data.summary,
    data.description,
    data.content,
    data.text,
    data.shortSummary,
    data.latestActionText,
    // For bills, include sponsor and committee info
    data.sponsors?.map((s) => s.fullName).join(' '),
    data.committees?.map((c) => c.name).join(' '),
  ]
    .filter(Boolean)
    .join(' ');

  for (const [sectorKey, sectorConfig] of Object.entries(SECTORS)) {
    const { count: keywordCount, matched: matchedKws } = countKeywordMatches(
      textContent,
      sectorConfig.keywords
    );
    const { count: highImpactCount } = countKeywordMatches(
      textContent,
      sectorConfig.highImpactKeywords
    );

    // Require at least 2 keyword matches to generate a signal
    if (keywordCount < 2) continue;

    const confidence = calculateConfidence(keywordCount, highImpactCount, sectorConfig.keywords.length);
    if (confidence < 2) continue;

    const materiality = calculateMateriality(sectorKey, keywordCount, highImpactCount, source);
    const urgency = calculateUrgency(textContent, source);
    const affectedCompanies = identifyAffectedCompanies(textContent, sectorConfig);

    const title = generateSignalTitle(textContent, sectorConfig.name, source);
    const description = generateDescription(data, sectorKey, matchedKws);
    const sourceUrl = data.url || data.congressUrl || data.link || null;

    signals.push({
      title,
      description,
      affected_companies: affectedCompanies,
      sector: sectorKey,
      confidence,
      materiality,
      urgency,
      source,
      source_url: sourceUrl,
      raw_data_id: rawDataId,
    });

    logger.info(`Signal generated for ${sectorKey} sector`, {
      source,
      confidence,
      materiality,
      urgency,
      keywordCount,
      highImpactCount,
      affectedCompanies: affectedCompanies.length,
    });
  }

  return signals;
}

/**
 * Save a signal to the database
 */
async function saveSignal(signal) {
  const result = await query(
    `INSERT INTO signals
      (title, description, affected_companies, sector, confidence, materiality, urgency, source, source_url, raw_data_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      signal.title,
      signal.description,
      JSON.stringify(signal.affected_companies),
      signal.sector,
      signal.confidence,
      signal.materiality,
      signal.urgency,
      signal.source,
      signal.source_url,
      signal.raw_data_id,
    ]
  );
  return result.rows[0];
}

/**
 * Process raw policy data and generate signals
 * @param {string} rawDataId - ID of the raw_policy_data record
 * @param {string} source - Data source (congress/sec/news)
 * @param {Object} data - Parsed policy data
 * @returns {Array} Created signal records
 */
async function processDataForSignals(rawDataId, source, data) {
  try {
    const potentialSignals = await analyzeForSignals(rawDataId, source, data);
    const savedSignals = [];

    for (const signal of potentialSignals) {
      const saved = await saveSignal(signal);
      savedSignals.push(saved);
    }

    return savedSignals;
  } catch (err) {
    logger.error('Error processing data for signals', {
      rawDataId,
      source,
      error: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

module.exports = { processDataForSignals, analyzeForSignals };
