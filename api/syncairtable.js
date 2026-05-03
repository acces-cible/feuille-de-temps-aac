const axios = require('axios');

// POST /api/syncairtable
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const body = req.body;
  const { empId, date } = body;

  console.log('=== syncAirtable ===', { empId, date, recordId: body.recordId, start: body.start, end: body.end });

  if (!empId || !date) {
    return res.status(400).json({ error: 'empId et date requis' });
  }

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

  // Construire les champs
  // Les valeurs vides envoient null pour effacer la cellule dans Airtable
  const fields = {};
  fields["Employé"] = [empId];
  fields["Date"]    = date;

  if (body.start     !== undefined) fields["Début"]           = body.start     !== '' ? body.start.toString()     : null;
  if (body.end       !== undefined) fields["Fin"]             = body.end       !== '' ? body.end.toString()       : null;
  if (body.lunch     !== undefined) fields["Dîner"]           = body.lunch     !== '' ? body.lunch.toString()     : null;
  if (body.notes     !== undefined) fields["Notes"]           = body.notes     !== '' ? body.notes               : null;
  if (body.adminNote !== undefined) fields["Note Admin"]      = body.adminNote !== '' ? body.adminNote           : null;
  if (periode        !== undefined && periode !== '') fields["Période de paie"] = periode;
  if (approved       !== undefined) fields["Approuvé"]        = approved === true;

  console.log('Champs:', JSON.stringify(fields));

  try {
    // Si l'ID est connu, tenter un PATCH direct
    if (body.recordId) {
      try {
        await axios.patch(`${baseUrl}/${body.recordId}`, { fields }, { headers });
        console.log(`PATCH direct OK: ${body.recordId}`);
        return res.status(200).json({ message: 'OK', recordId: body.recordId });
      } catch (patchErr) {
        if (patchErr.response?.status === 404 || patchErr.response?.status === 422) {
          console.warn(`PATCH ${body.recordId} échoué (${patchErr.response?.status}), fallback recherche`);
        } else {
          throw patchErr;
        }
      }
    }

    // Recherche par date — filtre simple + vérif employé en JS
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

    console.log(`Lignes trouvées pour ${empId} / ${date}: ${empRecords.length}`);

    // Déduplication
    if (empRecords.length > 1) {
      const extras = empRecords.slice(1);
      await Promise.all(extras.map(r => axios.delete(`${baseUrl}/${r.id}`, { headers })));
      console.log(`Dédupliqué: ${extras.length} doublon(s) supprimé(s)`);
    }

    const existingRecord = empRecords[0] || null;

    if (existingRecord) {
      await axios.patch(`${baseUrl}/${existingRecord.id}`, { fields }, { headers });
      console.log(`PATCH OK: ${existingRecord.id}`);
      return res.status(200).json({ message: 'OK', recordId: existingRecord.id });
    }

    // Ne créer un nouveau record que si la ligne a vraiment des données
    const hasContent = (body.start && body.start !== '')
                    || (body.end   && body.end   !== '')
                    || (body.notes && body.notes !== '');

    if (hasContent) {
      const created = await axios.post(baseUrl, { fields }, { headers });
      console.log(`POST OK: nouvelle ligne ${date} → ${created.data.id}`);
      return res.status(200).json({ message: 'OK', recordId: created.data.id });
    }

    console.log('Skip: aucune donnée');
    return res.status(200).json({ message: 'Skip' });

  } catch (error) {
    const detail = error.response ? JSON.stringify(error.response.data) : error.message;
    const status = error.response?.status || 500;
    console.error(`ERREUR AIRTABLE (${status}):`, detail);
    return res.status(status).json({ error: detail });
  }
}
