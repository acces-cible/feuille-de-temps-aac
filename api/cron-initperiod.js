const axios = require('axios');

// GET /api/cron-initperiod — appelé automatiquement par Vercel cron chaque lundi à minuit
module.exports = async function handler(req, res) {
  // Vérification sécurité — seulement Vercel peut appeler ce endpoint
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;
  const EMP_TABLE   = encodeURIComponent("Employés");
  const TIME_TABLE  = encodeURIComponent("Feuilles de temps");
  const headers     = { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' };
  const baseUrl     = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;

  try {
    // 1. Récupérer tous les employés actifs
    const empRes = await axios.get(`${baseUrl}/${EMP_TABLE}`, { headers });
    const employees = empRes.data.records.map(r => ({ id: r.id, name: r.fields['Nom AI'] || '' }));

    // 2. Calculer les 14 dates de la période courante
    // Ancre : 2026-04-06 (lundi de référence)
    const ANCHOR = new Date('2026-04-06T00:00:00Z');
    const today  = new Date();
    today.setUTCHours(0,0,0,0);
    const diffDays = Math.floor((today - ANCHOR) / 86400000);
    const periodStart = new Date(ANCHOR);
    periodStart.setDate(periodStart.getDate() + Math.floor(diffDays / 14) * 14);

    const dates = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(periodStart);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }

    console.log(`Cron initPeriod: ${dates[0]} → ${dates[13]}, ${employees.length} employés`);

    // 3. Pour chaque employé × date, créer le record s'il n'existe pas
    let created = 0, skipped = 0, errors = 0;

    for (const emp of employees) {
      for (const date of dates) {
        try {
          const filter = encodeURIComponent(`AND({Date}='${date}',FIND('${emp.id}',ARRAYJOIN({Employé},',')))`);
          const check  = await axios.get(`${baseUrl}/${TIME_TABLE}?filterByFormula=${filter}`, { headers });

          if (check.data.records.length > 0) { skipped++; continue; }

          await axios.post(`${baseUrl}/${TIME_TABLE}`, {
            fields: { "Employé": [emp.id], "Date": date }
          }, { headers });

          created++;
        } catch (err) {
          console.error(`Erreur ${emp.name} / ${date}:`, err.response?.data || err.message);
          errors++;
        }
      }
    }

    console.log(`Cron terminé: ${created} créés, ${skipped} existants, ${errors} erreurs`);
    return res.status(200).json({ created, skipped, errors, period: `${dates[0]} → ${dates[13]}` });

  } catch (error) {
    console.error('Cron initPeriod erreur:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
