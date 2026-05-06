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

  // ── 1. Récupérer TOUS les records existants pour cette plage de dates ──────
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

  // Indexer par "empId_date"
  const existingMap = {};
  existingRecords.forEach(r => {
    const date   = r.fields['Date'];
    const empIds = r.fields['Employé'] || [];
    empIds.forEach(empId => {
      if (date) existingMap[`${empId}_${date}`] = r.id;
    });
  });

  console.log(`initPeriod: ${existingRecords.length} records existants trouvés`);

  const results = [];
  let totalCreated = 0, totalSkipped = 0, totalErrors = 0;

  for (const emp of employees) {
    if (!emp.airtableId) continue;

    // Séparer existants / manquants pour cet employé
    const toCreate = [];
    for (const date of dates) {
      const key = `${emp.airtableId}_${date}`;
      if (existingMap[key]) {
        results.push({ empId: emp.airtableId, date, recordId: existingMap[key] });
        totalSkipped++;
      } else {
        toCreate.push(date);
      }
    }

    // ── 2. Créer les manquants par batch de 10 (limite Airtable) ─────────────
    // 7 employés × 14 jours → max 14 requêtes au lieu de 98
    for (let i = 0; i < toCreate.length; i += 10) {
      const batch = toCreate.slice(i, i + 10).map(date => ({
        fields: { 'Employé': [emp.airtableId], 'Date': date }
      }));

      try {
        const resp = await axios.post(baseUrl, { records: batch }, { headers });
        (resp.data.records || []).forEach(r => {
          const date = r.fields['Date'];
          if (date) {
            results.push({ empId: emp.airtableId, date, recordId: r.id });
            totalCreated++;
          }
        });
      } catch (err) {
        console.error(`Erreur batch création ${emp.name}:`, err.response?.data || err.message);
        totalErrors += batch.length;
      }
    }

    console.log(`${emp.name}: ${totalSkipped} existants, ${toCreate.length} à créer`);
  }

  console.log(`initPeriod terminé: ${totalCreated} créés, ${totalSkipped} existants, ${totalErrors} erreurs`);

  return res.status(200).json({
    created: totalCreated,
    skipped: totalSkipped,
    errors:  totalErrors,
    records: results,   // ← utilisé par index.html pour sauvegarder row.airtableRecordId
  });
};
