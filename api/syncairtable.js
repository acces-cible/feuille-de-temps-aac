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

// POST /api/syncAirtable
export default async function handler(req, res) {
  // OPTIONS preflight
  setCORS(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const body = req.body;
  const { empId, date } = body;

  console.log('=== syncAirtable ===', { empId, date, start: body.start, end: body.end });

  if (!empId || !date) {
    return res.status(400).json({ error: 'empId et date requis' });
  }

  const sendRem  = body["Envoyer Rappel"];
  const approved = body.approved;
  const periode  = body.periodeDePaie;

  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return res.status(500).json({ error: 'Variables environnement manquantes' });
  }

  const TABLE_NAME = encodeURIComponent("Feuilles de temps");
  const headers = {
    Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    'Content-Type': 'application/json'
  };
  const baseUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}`;

  try {
    // Chercher lignes existantes pour cette date
    const filter = `{Date}='${date}'`;
    const searchRes = await axios.get(
      `${baseUrl}?filterByFormula=${encodeURIComponent(filter)}`,
      { headers }
    );

    const allForDate = searchRes.data.records;
    const empRecords = allForDate.filter(r => {
      const linked = r.fields['Employé'] || [];
      return linked.includes(empId);
    });

    console.log(`Lignes pour ${empId} / ${date}: ${empRecords.length}`);

    // Déduplication
    if (empRecords.length > 1) {
      const extras = empRecords.slice(1);
      await Promise.all(extras.map(r => axios.delete(`${baseUrl}/${r.id}`, { headers })));
      console.log(`Dédupliqué: ${extras.length} doublon(s)`);
    }

    const existingRecord = empRecords[0] || null;

    // Construire les champs
    const fields = {};
    fields["Employé"] = [empId];
    fields["Date"]    = date;

    if (body.start     !== undefined && body.start     !== '') fields["Début"]           = body.start.toString();
    if (body.end       !== undefined && body.end       !== '') fields["Fin"]             = body.end.toString();
    if (body.lunch     !== undefined && body.lunch     !== '') fields["Dîner"]           = body.lunch.toString();
    if (body.notes     !== undefined)                          fields["Notes"]           = body.notes;
    if (body.adminNote !== undefined)                          fields["Note Admin"]      = body.adminNote;
    if (periode        !== undefined && periode        !== '') fields["Période de paie"] = periode;
    if (approved       !== undefined)                          fields["Approuvé"]        = approved;
    if (sendRem        !== undefined)                          fields["Envoyer Rappel"]  = sendRem;

    console.log('Champs:', JSON.stringify(fields));

    if (existingRecord) {
      await axios.patch(`${baseUrl}/${existingRecord.id}`, { fields }, { headers });
      console.log(`PATCH OK: ${existingRecord.id}`);
    } else {
      const hasContent = (body.start && body.start !== '')
                      || (body.end   && body.end   !== '')
                      || (body.notes && body.notes !== '')
                      || sendRem  !== undefined
                      || approved !== undefined;

      if (hasContent) {
        await axios.post(baseUrl, { fields }, { headers });
        console.log(`POST OK: nouvelle ligne ${date}`);
      } else {
        console.log('Skip: aucune donnée');
      }
    }

    return res.status(200).json({ message: 'OK' });

  } catch (error) {
    const detail = error.response ? JSON.stringify(error.response.data) : error.message;
    const status = error.response?.status || 500;
    console.error(`ERREUR AIRTABLE (${status}):`, detail);
    return res.status(status).json({ error: detail });
  }
}
