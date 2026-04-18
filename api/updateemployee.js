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

// POST /api/updateEmployee
export default async function handler(req, res) {
  // OPTIONS preflight
  setCORS(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const body = req.body;
  const { airtableId } = body;

  if (!airtableId) {
    return res.status(400).json({ error: 'airtableId requis' });
  }

  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;
  const TABLE_NAME = encodeURIComponent("Employés");
  const headers = {
    Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    'Content-Type': 'application/json'
  };
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}/${airtableId}`;

  const fields = {};
  if (body.inputMode !== undefined) fields['Mode saisie']   = body.inputMode;
  if (body.autoFill  !== undefined) fields['AutoFill']      = body.autoFill;
  if (body.partTime  !== undefined) fields['Temps partiel'] = body.partTime;

  if (Object.keys(fields).length === 0) {
    return res.status(200).json({ message: 'Rien à mettre à jour' });
  }

  try {
    await axios.patch(url, { fields }, { headers });
    console.log(`updateEmployee OK: ${airtableId}`, fields);
    return res.status(200).json({ message: 'OK' });
  } catch (error) {
    const detail = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('ERREUR updateEmployee:', detail);
    return res.status(500).json({ error: detail });
  }
}
