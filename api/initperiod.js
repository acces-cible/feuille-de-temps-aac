const axios = require('axios');

// POST /api/initperiod
// Pré-crée les enregistrements vides dans Feuilles de temps pour une période
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { employees, dates } = req.body;
  // employees = [{ airtableId, name }]
  // dates = ['2026-05-04', '2026-05-05', ...]

  if (!employees?.length || !dates?.length) {
    return res.status(400).json({ error: 'employees et dates requis' });
  }

  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;
  const TABLE_NAME = encodeURIComponent("Feuilles de temps");
  const headers = {
    Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    'Content-Type': 'application/json'
  };
  const baseUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}`;

  const results = [];
  let created = 0, skipped = 0, errors = 0;

  for (const emp of employees) {
    if (!emp.airtableId) continue;

    for (const date of dates) {
      // Vérifier si un record existe déjà
      try {
        const filter = encodeURIComponent(`AND({Date}='${date}',FIND('${emp.airtableId}',ARRAYJOIN({Employé},',')))`);
        const check = await axios.get(`${baseUrl}?filterByFormula=${filter}`, { headers });

        if (check.data.records.length > 0) {
          skipped++;
          continue;
        }

        // Créer le record vide avec seulement Employé + Date
        const created_rec = await axios.post(baseUrl, {
          fields: {
            "Employé": [emp.airtableId],
            "Date": date
          }
        }, { headers });

        results.push({ empId: emp.airtableId, date, recordId: created_rec.data.id });
        created++;

      } catch (err) {
        const detail = err.response ? JSON.stringify(err.response.data) : err.message;
        console.error(`Erreur ${emp.name} / ${date}:`, detail);
        errors++;
      }
    }
  }

  console.log(`initPeriod: ${created} créés, ${skipped} existants, ${errors} erreurs`);
  return res.status(200).json({ created, skipped, errors, records: results });
}
