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

  // Récupérer TOUS les records de la période en une seule requête
  const startDate = dates[0];
  const endDate   = dates[dates.length - 1];
  const filter    = encodeURIComponent(`AND({Date}>='${startDate}',{Date}<='${endDate}')`);

  let existingRecords = [];
  try {
    let offset = null;
    do {
      const url = `${baseUrl}?filterByFormula=${filter}${offset ? `&offset=${offset}` : ''}`;
      const resp = await axios.get(url, { headers });
      existingRecords = existingRecords.concat(resp.data.records);
      offset = resp.data.offset || null;
    } while (offset);
  } catch (err) {
    console.error('Erreur fetch existants:', err.response?.data || err.message);
    return res.status(500).json({ error: 'Impossible de lire les records existants' });
  }

  // Indexer par "empId_date" pour lookup rapide
  const existingMap = {};
  existingRecords.forEach(r => {
    const empIds = r.fields['Employé'] || [];
    const date   = r.fields['Date'];
    empIds.forEach(empId => {
      existingMap[`${empId}_${date}`] = r.id;
    });
  });

  console.log(`initPeriod: ${existingRecords.length} records existants trouvés`);

  const results = [];
  let created = 0, skipped = 0, errors = 0;

  for (const emp of employees) {
    if (!emp.airtableId) continue;
    for (const date of dates) {
      const key = `${emp.airtableId}_${date}`;
      if (existingMap[key]) {
        results.push({ empId: emp.airtableId, date, recordId: existingMap[key] });
        skipped++;
        continue;
      }
      // Créer le record manquant
      try {
        const created_rec = await axios.post(baseUrl, {
          fields: { "Employé": [emp.airtableId], "Date": date }
        }, { headers });
        results.push({ empId: emp.airtableId, date, recordId: created_rec.data.id });
        created++;
      } catch (err) {
        console.error(`Erreur création ${emp.name}/${date}:`, err.response?.data || err.message);
        errors++;
      }
    }
  }

  console.log(`initPeriod terminé: ${created} créés, ${skipped} existants, ${errors} erreurs`);
  return res.status(200).json({ created, skipped, errors, records: results });
}
