import Constants from 'expo-constants';

// 1. Dynamic URL logic
// If we are in development, use localhost. If in production, use your live link.
const API_URL = __DEV__
  ? 'http://localhost:5000'  // Your local backend port
  : 'https://lifepilot-backend.onrender.com'; // Replace with your REAL hosted URL later

console.log('🔗 Connecting to API at:', API_URL);

// 2. Optimized Fetch Helper
const apiFetch = async (endpoint, options = {}) => {
  try {
    const response = await fetch(`${API_URL}${endpoint}`, options);
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error(`❌ API Error [${endpoint}]:`, error);
    return null;
  }
};

// --- Currency Cleaning: strip USD, AED, $, etc. for clean numbers ---
const CURRENCY_SYMBOLS_AND_CODES = /\s*(?:USD|AED|EUR|GBP|INR|SAR|QAR|KWD|BHD|OMR|\$|€|£|د\.إ|ر\.س)\s*|,/gi;

function cleanCurrency(value) {
  if (value == null) return 0;
  const str = String(value).trim().replace(CURRENCY_SYMBOLS_AND_CODES, '');
  const num = parseFloat(str.replace(/\s/g, '')) || 0;
  return Math.round(num * 100) / 100;
}

// --- Cleaning Map: strip transaction codes, dates, URLs before state ---
const CLEANING_MAP = {
  // Transaction codes and alert words (Dbt, Transaction, Alert, Vza, POS, etc.)
  transactionCodes: /\b(?:Dbt|DBT|Transaction|Alert|Vza|VZA|POS|CHG|TXN|PMT|Debit|Xfer|XFER|Ref|REF|Credit|CR)[*\s.:\-]*/gi,
  // Dates: 12/31/24, 31-12-2024, 31 Dec 2024, Dec 31, 2024-01-15, etc.
  dates: /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b|\b\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s*\d{4}\b|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\b/gi,
  // URLs: https://..., http://..., www.xxx.yyy, and path segments .com/xxx, .net/yyy
  urls: /https?:\/\/[^\s]+|www\.\S+|\.(?:com|net|org|co\.uk|io|app)(?:\/[\w.-]*)+/gi,
  // Leftover path/domain junk: standalone .com/, /ch, /bill, /payment
  pathSlug: /\/[\w.-]+/g,
  // Asterisks and repeated punctuation used as separators
  separators: /[*]+|\s*[.\-]{2,}\s*/g,
};

function cleanMerchantString(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw.trim();
  for (const key of Object.keys(CLEANING_MAP)) {
    s = s.replace(CLEANING_MAP[key], ' ');
  }
  s = s.replace(/[^\w\s]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

// --- Merchant Normalization: "APPLE.COM/BILL" → "Apple" (runs after Cleaning Map) ---
const DOMAIN_SUFFIXES = /\.(com|net|org|co\.uk|io|app|bill)(?:\/[\w.-]*)?$/i;
const SLASH_AND_EXTRA = /[/\\\-_]+/g;
const MULTI_SPACE = /\s+/g;

function normalizeMerchant(rawName) {
  if (!rawName || typeof rawName !== 'string') return 'Unknown';
  let s = cleanMerchantString(rawName);
  s = s
    .replace(DOMAIN_SUFFIXES, '')
    .replace(SLASH_AND_EXTRA, ' ')
    .replace(MULTI_SPACE, ' ')
    .trim();
  if (!s) return 'Unknown';
  // Title case: first letter of each word upper, rest lower
  s = s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  return s;
}

// --- Auto-Category: Dbt, Purchase, Recurring → Bento categories ---
const CATEGORY_RULES = [
  { pattern: /\b(?:recurring|subscription|auto[- ]?pay|monthly\s+bill|disney|hulu|apple\s+music)\b/i, category: 'Subscription' },
  { pattern: /\b(?:dbt|debit|purchase|pos|card\s+payment|spent|payment\s+to)\b/i, category: 'Purchase' },
  { pattern: /\b(?:transfer|sent|sent\s+to|wire|ach)\b/i, category: 'Transfer' },
  { pattern: /\b(?:bill|utility|invoice|due)\b/i, category: 'Bill' },
  { pattern: /\b(?:refund|credited|reversal)\b/i, category: 'Refund' },
];

function inferCategory(smsText) {
  if (!smsText || typeof smsText !== 'string') return 'Subscription';
  const raw = smsText.trim();
  for (const { pattern, category } of CATEGORY_RULES) {
    if (pattern.test(raw)) return category;
  }
  return 'Subscription';
}

// --- Streaming: Netflix, Spotify, Apple → always 'Streaming' for Bento ---
const STREAMING_MERCHANTS = /\b(netflix|spotify|apple)\b/i;

function resolveCategory(smsText, normalizedName, inferred) {
  if (STREAMING_MERCHANTS.test(normalizedName)) return 'Streaming';
  return inferred;
}

// --- Price extraction: ONLY use amount with $ and decimal; ignore #id and long integers ---
function isLongId(numStr) {
  const s = String(numStr).replace(/,/g, '');
  return /^\d+$/.test(s) && s.length > 5;
}

function extractAmount(raw) {
  // 1) Prefer explicit dollar amount with decimal: " - $15.99" or "$15.99" (never #12345678)
  const dollarDecimal = raw.match(/\$\s*([\d,]+\.\d+)/);
  if (dollarDecimal) return cleanCurrency(dollarDecimal[1]);
  const withCode = raw.match(/([\d,]+\.\d+)\s*(?:USD|AED|EUR|GBP)/i);
  if (withCode) return cleanCurrency(withCode[1]);
  // 2) Any number with a decimal that isn't part of #id (prefer last one, often the amount)
  const decimals = raw.match(/[\d,]+\.\d+/g);
  if (decimals && decimals.length > 0) {
    const last = decimals[decimals.length - 1];
    if (!isLongId(last)) return cleanCurrency(last);
  }
  const shortInt = raw.match(/\b(\d{1,5})\b(?!\.\d)/);
  if (shortInt) return cleanCurrency(shortInt[1]);
  return 0;
}

// --- Extract merchant: "Dbt*NETFLIX.COM/CH" → use part after Dbt*; else "at/to/from X" ---
const DBT_STAR_MERCHANT = /Dbt\s*\*\s*([\w.\s\/\-]+?)(?:\s*#\d+|\s*-\s*\$|\s*$)/i;

function extractMerchantFromDbtStar(raw) {
  const m = raw.match(DBT_STAR_MERCHANT);
  if (m && m[1]) return m[1].trim().replace(/\s+/g, ' ').trim();
  return null;
}

const MERCHANT_AFTER_PREP = /(?:at|to|from)\s+([\w.\s\/\-]+?)(?:\s+on|\s+dated|\s+for\s+\$|\s*$|\.|,)/i;

function extractMerchantFromPreposition(raw) {
  const m = raw.match(MERCHANT_AFTER_PREP);
  if (m && m[1]) return m[1].trim().replace(/\s+/g, ' ').trim();
  return null;
}

function extractMerchant(raw) {
  return extractMerchantFromDbtStar(raw) || extractMerchantFromPreposition(raw) || null;
}

// --- Regex-Weighted Parser: apply cleaning + normalization + category; Bento-ready shape ---
function applyRegexWeightedPipeline(parsed, smsText) {
  if (!parsed) return null;
  const price = cleanCurrency(parsed.price ?? parsed.amount ?? 0);
  const name = normalizeMerchant(parsed.name ?? parsed.merchant ?? '');
  const inferred = inferCategory(smsText);
  const category = resolveCategory(smsText, name, inferred);
  return toBentoShape(name, price, category);
}

function toBentoShape(merchant, monthly_cost, category) {
  return {
    name: merchant,
    merchant,
    price: monthly_cost,
    monthly_cost,
    category,
  };
}

// --- Scan trigger: only run parser when "Dbt" or "Transaction" is present ---
const SCAN_TRIGGER = /\b(?:Dbt|Transaction)\b/i;

function shouldStartScan(raw) {
  return SCAN_TRIGGER.test(raw);
}

// --- Price from pattern: use only if it looks like a real amount (has decimal or short integer) ---
function parsePriceCandidate(str) {
  if (!str) return 0;
  const cleaned = String(str).replace(/,/g, '').trim();
  if (isLongId(cleaned)) return 0;
  const num = parseFloat(cleaned);
  return isFinite(num) ? Math.round(num * 100) / 100 : 0;
}

// 3. Fast Parser — regex for common bank SMS formats (messy bank text)
const FAST_PARSER_PATTERNS = [
  // "Dbt $45.00 at Netflix" / "15.99 at APPLE" — merchant after at/to/from
  /(?:dbt|transaction|debit|charged|payment|purchase)\s+(?:\w+\s+)?(?:USD|AED|\$)?\s*([\d,]+\.\d+)\s*(?:USD|AED|\$)?\s*(?:at|to|from|for)\s+([\w.\s\/\-]+?)(?:\s+on|\s+dated|$)/i,
  /(?:USD|AED|\$)?\s*([\d,]+\.\d+)\s*(?:USD|AED|\$)?\s*(?:at|to|from|for)\s+([\w.\s\/\-]+?)(?:\s+on|\s+dated|$)/i,
  // "Dbt*NETFLIX.COM/CH #12345678 - $15.99" — price must have $ and decimal; merchant from Dbt* or from left of " - $"
  { pattern: /(.+?)\s*[-–]\s*\$\s*([\d,]+\.\d+)\s*$/, useDbtStarMerchant: true },
  /([\w.\s\/\-]+?)\s*[-–]\s*(?:USD|AED|\$)?\s*([\d,]+\.\d+)/,
  /([\w.\s\/\-]+)\s+(?:USD|AED|\$)?\s*([\d,]+\.\d+)/,
];

function fastParse(smsText) {
  const raw = smsText.trim();
  if (!raw || !shouldStartScan(raw)) return null;
  for (let i = 0; i < FAST_PARSER_PATTERNS.length; i++) {
    const entry = FAST_PARSER_PATTERNS[i];
    const pattern = entry.pattern || entry;
    const useDbtStarMerchant = entry.useDbtStarMerchant === true;
    const m = raw.match(pattern);
    if (!m) continue;
    // First two patterns: m[1]=price, m[2]=merchant. Rest: m[1]=merchant/left, m[2]=price
    const priceStr = (i <= 1) ? m[1] : m[2];
    const capturedName = (i <= 1) ? m[2] : m[1];
    const price = parsePriceCandidate(priceStr);
    if (price === 0 && priceStr && isLongId(String(priceStr).replace(/,/g, ''))) continue;
    let name = (typeof capturedName === 'string' ? capturedName : '').trim().replace(/\s+/g, ' ').trim();
    if (useDbtStarMerchant || /\b(?:Transaction|Dbt|Alert)\b/i.test(name)) {
      const dbtStar = extractMerchantFromDbtStar(raw);
      if (dbtStar) name = dbtStar;
    }
    if (!name) name = extractMerchant(raw) || 'Unknown';
    const finalPrice = price > 0 ? price : extractAmount(raw);
    if (finalPrice <= 0) continue;
    return applyRegexWeightedPipeline({ name, price: finalPrice }, raw);
  }
  return null;
}

// Robust fallback: price = only $ decimal; merchant = Dbt*X or at/to/from X, then clean
function mockAIParse(smsText) {
  const raw = smsText.trim();
  if (!shouldStartScan(raw)) return null;
  const price = extractAmount(raw);
  const rawName = extractMerchant(raw) || raw.match(/([A-Za-z][\w.\s\/\-]*)/)?.[1]?.trim() || 'Merchant';
  const name = normalizeMerchant(rawName);
  const inferred = inferCategory(raw);
  const category = resolveCategory(raw, name, inferred);
  return toBentoShape(name, price, category);
}

// 4. Exported Methods
export const getSubscriptionData = () => apiFetch('/subscriptions');

export const parseSMS = async (smsText) => {
  if (!smsText.trim()) return null;

  // Try backend first (when available)
  const backendResult = await apiFetch('/parse-sms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sms: smsText }),
  });
  if (backendResult != null && typeof backendResult.parsed_transactions === 'number') {
    return backendResult;
  }

  // Only run scan when "Dbt" or "Transaction" is present
  if (!shouldStartScan(smsText.trim())) {
    return { parsed_transactions: 0, transactions: [], subscription: null };
  }
  const parsed = fastParse(smsText) || mockAIParse(smsText);
  const transactions = parsed ? [parsed] : [];
  return {
    parsed_transactions: transactions.length,
    transactions,
    subscription: parsed,
  };
};

export const clearDatabase = () => apiFetch('/reset', { method: 'POST' });

export { API_URL };

