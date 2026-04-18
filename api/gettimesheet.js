const axios = require('axios');

// Domaines autorisés — ajoutez votre URL Vercel ici
const ALLOWED_ORIGINS = [
  'https://feuille-de-temps-aac.vercel.app',
  'https://feuille-de-temps-aac-git-main-acces-cible.vercel.app',
  // Ajoutez votre domaine custom ici si vous en avez un
];

function setCORS(req, res) {
  const origin = req.headers.origin || '';
  // Autoriser aussi les previews Vercel (*.vercel.app)
  const allowed = ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app');
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return allowed;
}

// GET /api/getTimesheet?empId=recXXXX&periodStart=2026-04-06&periodEnd=2026-04-19
export default async function handler(req, res) {
  // OPTIONS preflight
  setCORS(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { empId, periodStart, periodEnd } = req.query;

  console.log('=== getTimesheet ===', { empId, periodStart, periodEnd });

  if (!empId || !periodStart || !periodEnd) {
    return res.status(400).json({ error: 'empId, periodStart et periodEnd requis' });
  }

  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;
  const TABLE_NAME = encodeURIComponent("Feuilles de temps");
  const headers = { Authorization: `Bearer ${AIRTABLE_TOKEN}` };
  const baseUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}`;

  try {
    const response = await axios.get(
      `${baseUrl}?pageSize=100`,
      { headers }
    );

    const allRecords = response.data.records;
    console.log(`Total lignes: ${allRecords.length}`);

    const empRecords = allRecords.filter(r => {
      const linked = r.fields['Employé'] || [];
      const date   = r.fields['Date']    || '';
      return linked.includes(empId) && date >= periodStart && date <= periodEnd;
    });

    console.log(`Lignes pour ${empId}: ${empRecords.length}`);

    const rows = empRecords.map(r => ({
      date:      r.fields['Date']       || '',
      start:     r.fields['Début']      || '',
      end:       r.fields['Fin']        || '',
      lunch:     r.fields['Dîner']      || '',
      notes:     r.fields['Notes']      || '',
      adminNote: r.fields['Note Admin'] || '',
      approved:  r.fields['Approuvé']   || false,
    }));

    return res.status(200).json({ rows });

  } catch (error) {
    const detail = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('ERREUR getTimesheet:', detail);
    return res.status(error.response?.status || 500).json({ error: detail });
  }
}
