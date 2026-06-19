import * as XLSX from 'xlsx';
import { categorize } from './categorize';

function parseAmount(s) {
  if (!s) return 0;
  return parseFloat(String(s).replace(/[$,\s]/g, '').replace('−', '-')) || 0;
}

function normalizeAmexDate(d) {
  try {
    const months = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };
    const m = d.match(/(\d+)\s+(\w+)\.?\s+(\d{4})/);
    if (m) return `${m[3]}-${String(months[m[2]]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    return d;
  } catch { return d; }
}

function detectSource(headers, sampleText, fileName) {
  const h = headers.map(x => (x || '').toLowerCase().trim());
  const t = sampleText.toUpperCase();
  const fn = (fileName || '').toLowerCase();

  if (h.includes('transfer date') && h.includes('balance'))
    return { source: 'EQ Bank', confidence: 'high', needsCardName: false };
  if (h.includes('foreign spend amount') || h.includes('exchange rate'))
    return { source: 'Amex', confidence: 'high', needsCardName: false };
  if (h.includes('filter') && h.includes('type of transaction'))
    return { source: 'Scene+ Visa', confidence: 'high', needsCardName: false };
  if (h.includes('transaction_type') && h.includes('merchant'))
    return { source: 'Wealthsimple CC', confidence: 'high', needsCardName: false };
  if (h.includes('date processed') && h.includes('description') && h.includes('amount') && !h.includes('balance') && !h.includes('filter')) {
    const hasHint = fn.includes('cobalt') || fn.includes('plat');
    return { source: 'Amex CSV', confidence: hasHint ? 'high' : 'low', needsCardName: !hasHint };
  }
  if ((h.length === 5 && h[0].match(/\d{4}-\d{2}-\d{2}/)) || t.includes('5268'))
    return { source: 'CIBC Costco', confidence: 'high', needsCardName: false };
  return { source: 'Unknown', confidence: 'low', needsCardName: false };
}

// Pre-check a file — returns { source, confidence, needsCardName }
// confidence 'high' = auto-upload, 'low' = show prompt to user
export async function detectFileSource(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xls') || name.endsWith('.xlsx')) {
    return { source: 'Amex XLS', confidence: 'high', needsCardName: false };
  }
  if (name.endsWith('.csv')) {
    const text = await file.text();
    const firstLine = text.trim().split('\n')[0];
    const headers = firstLine.split(',').map(h => h.replace(/^"|"$/g,'').toLowerCase().trim());
    return detectSource(headers, text.slice(0, 500), file.name);
  }
  return { source: 'Unknown', confidence: 'low', needsCardName: false };
}

export async function parseFile(file, cardNameOverride) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xls') || name.endsWith('.xlsx')) {
    return parseXLS(file);
  } else if (name.endsWith('.csv')) {
    return parseCSVFile(file, cardNameOverride);
  }
  return [];
}

async function parseXLS(file) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const text = rows.flat().join(' ');
  const cardName = text.includes('Cobalt') ? 'Amex Cobalt' : 'Amex Platinum';

  let headerRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][1] || '').toLowerCase().includes('date processed')) { headerRow = i; break; }
    if (String(rows[i][0] || '').toLowerCase() === 'date') { headerRow = i; break; }
  }
  if (headerRow === -1) return [];

  const headers = rows[headerRow].map(h => (h || '').toLowerCase().trim());
  const dateIdx = headers.findIndex(h => h === 'date');
  const descIdx = headers.findIndex(h => h === 'description');
  const amtIdx = headers.findIndex(h => h === 'amount');

  return rows.slice(headerRow + 1)
    .filter(r => r[dateIdx] && String(r[dateIdx]).match(/\d/))
    .map((r, i) => {
      const amt = parseAmount(String(r[amtIdx]));
      return {
        id: `${cardName}_${r[dateIdx]}_${i}`,
        date: normalizeAmexDate(String(r[dateIdx])),
        description: String(r[descIdx] || '').trim(),
        amount: Math.abs(amt),
        is_credit: amt < 0,
        source: 'Amex',
        card: cardName,
      };
    })
    .filter(t => t.description && t.amount > 0);
}

async function parseCSVFile(file, cardNameOverride) {
  const text = await file.text();
  const lines = text.trim().split('\n');
  const parseRow = line => {
    const result = []; let cur = ''; let inQ = false;
    for (let c of line) {
      if (c === '"') inQ = !inQ;
      else if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    result.push(cur.trim());
    return result;
  };
  const rows = lines.map(parseRow);
  const headers = rows[0].map(h => (h || '').toLowerCase().trim());
  const dataRows = rows.slice(1).filter(r => r.some(c => c.trim()));
  const detected = detectSource(headers, text.slice(0, 500), file.name);
  const source = detected.source;

  if (source === 'EQ Bank') {
    return dataRows.map((r, i) => {
      const amt = parseAmount(r[2]);
      return {
        id: `eq_${r[0]}_${i}`,
        date: r[0],
        description: (r[1] || '').trim(),
        amount: Math.abs(amt),
        is_credit: amt > 0,
        source: 'EQ Bank',
        card: 'EQ Bank',
      };
    }).filter(t => t.description && t.amount > 0);
  }

  if (source === 'Scene+ Visa') {
    const dateIdx = headers.findIndex(h => h.includes('date'));
    const descIdx = headers.findIndex(h => h.includes('description'));
    const amtIdx = headers.findIndex(h => h.includes('amount'));
    return dataRows.map((r, i) => {
      const amt = parseAmount(r[amtIdx]);
      return {
        id: `scene_${r[dateIdx]}_${i}`,
        date: r[dateIdx],
        description: (r[descIdx] || '').trim(),
        amount: Math.abs(amt),
        is_credit: amt < 0,
        source: 'Scene+ Visa',
        card: 'Scene+ Visa',
      };
    }).filter(t => t.description && t.amount > 0);
  }

  if (source === 'CIBC Costco') {
    return dataRows.map((r, i) => {
      const amt = parseAmount(r[2]);
      return {
        id: `cibc_${r[0]}_${i}`,
        date: r[0],
        description: (r[1] || '').trim(),
        amount: Math.abs(amt),
        is_credit: amt < 0,
        source: 'CIBC Costco',
        card: 'CIBC Costco MC',
      };
    }).filter(t => t.description && t.amount > 0);
  }

  // Unknown — best guess
  return dataRows.map((r, i) => {
    const amt = parseAmount(r[2] || r[3]);
    return {
      id: `unk_${file.name}_${r[0]}_${i}`,
      date: r[0],
      description: (r[1] || '').trim(),
      amount: Math.abs(amt),
      is_credit: amt < 0,
      source: file.name,
      card: file.name,
    };
  }).filter(t => t.description && t.amount > 0);
}