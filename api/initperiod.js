const axios = require('axios');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { employees, dates } = req.body;
  if (!employees?.length || !dates?.length) {
    return res.status(400).json({ error: 'employees et dates requis' });
  }

  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;
  const TABLE_NAME = encodeURIComponent("Feuilles de temps");
  const headers = { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' };
  const baseUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}`;

  const results = [];
  let created = 0, skipped = 0, errors = 0;

  for (const emp of employees) {
    if (!emp.airtableId) continue;

    for (const date of dates) {
      try {
        // Chercher si un record existe déjà
        const filter = encodeURIComponent(`{Date}='${date}'`);
        const check = await axios.get(`${baseUrl}?filterByFormula=${filter}`, { headers });
        const existing = check.data.records.find(r =>
          (r.fields['Employé'] || []).includes(emp.airtableId)
        );

        if (existing) {
          // Record existe — retourner quand même son recordId
          results.push({ empId: emp.airtableId, date, recordId: existing.id });
          skipped++;
          continue;
        }

        // Créer le record vide
        const created_rec = await axios.post(baseUrl, {
          fields: { "Employé": [emp.airtableId], "Date": date }
        }, { headers });

        results.push({ empId: emp.airtableId, date, recordId: created_rec.data.id });
        created++;

      } catch (err) {
        console.error(`Erreur ${emp.name} / ${date}:`, err.response?.data || err.message);
        errors++;
      }
    }
  }

  console.log(`initPeriod: ${created} créés, ${skipped} existants, ${errors} erreurs`);
  return res.status(200).json({ created, skipped, errors, records: results });
}
