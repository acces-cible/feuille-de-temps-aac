const axios = require('axios');

// GET /api/gettimesheet?empId=recXXXX&periodStart=2026-04-06&periodEnd=2026-04-19
module.exports = async function handler(req, res) {
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

  // Filtrer par date côté Airtable (rapide : ~84 records max par période)
  // Filtrer par employé côté client (r.fields['Employé'] retourne un tableau d'IDs record)
  const formula = encodeURIComponent(
    `AND({Date}>='${periodStart}', {Date}<='${periodEnd}')`
  );

  try {
    let allRecords = [];
    let offset = null;
    do {
      const url = `${baseUrl}?pageSize=100&filterByFormula=${formula}${offset ? `&offset=${offset}` : ''}`;
      const response = await axios.get(url, { headers });
      allRecords = allRecords.concat(response.data.records);
      offset = response.data.offset || null;
    } while (offset);

    console.log(`Total lignes pour la période: ${allRecords.length}`);

    // Filtrer par employé côté client (fields['Employé'] = tableau de record IDs)
    const empRecords = allRecords.filter(r => {
      const linked = r.fields['Employé'] || [];
      return linked.includes(empId);
    });

    console.log(`Lignes pour ${empId}: ${empRecords.length}`);

    // Dédupliquer par date: garder l'enregistrement avec le plus de données
    // et supprimer les doublons directement dans Airtable
    const byDate = {};
    const toDelete = [];
    empRecords.forEach(r => {
      const date = r.fields['Date'] || '';
      if (!byDate[date]) {
        byDate[date] = r;
      } else {
        const prev = byDate[date];
        const prevScore = ['Début','Fin','Dîner','Pause','Notes'].filter(k => prev.fields[k]).length;
        const curScore  = ['Début','Fin','Dîner','Pause','Notes'].filter(k => r.fields[k]).length;
        if (curScore > prevScore) {
          toDelete.push(byDate[date].id); // l'ancien perd
          byDate[date] = r;
        } else {
          toDelete.push(r.id); // le nouveau perd
        }
      }
    });

    // Supprimer les doublons en parallèle (nettoyage Airtable automatique)
    if (toDelete.length > 0) {
      console.log(`Suppression de ${toDelete.length} doublon(s) pour ${empId}...`);
      await Promise.allSettled(toDelete.map(id =>
        axios.delete(`${baseUrl}/${id}`, { headers })
      ));
    }

    if (empRecords[0]) console.log('CHAMPS DISPO:', Object.keys(empRecords[0].fields));
    const rows = Object.values(byDate).map(r => ({
      airtableRecordId: r.id,
      date:      r.fields['Date']       || '',
      start:     r.fields['Début']      || '',
      end:       r.fields['Fin']        || '',
      lunch:     r.fields['Dîner']      || '',
      pause:     r.fields['Pause']      || '',
      notes:     r.fields['Notes']      || '',
      adminNote: r.fields['Note Admin'] || '',
      approved:  r.fields['Approuvé']   || false,
    }));

    res.setHeader('Cache-Control', 'no-store');
return res.status(200).json({ rows });

  } catch (error) {
    const detail = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('ERREUR getTimesheet:', detail);
    return res.status(error.response?.status || 500).json({ error: detail });
  }
}
