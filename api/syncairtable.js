const axios = require('axios');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const body = req.body;
  const { empId, date } = body;

  if (!empId || !date) {
    return res.status(400).json({ error: 'empId et date requis' });
  }

  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;
  const TABLE_NAME = encodeURIComponent("Feuilles de temps");
  const headers = { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' };
  const baseUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}`;

  // Champs sans Employé — on ne touche JAMAIS au champ lié après création
  const fields = {};
  fields["Date"] = date;
  if (body.start     !== undefined && body.start     !== '') fields["Début"]      = body.start.toString();
  if (body.end       !== undefined && body.end       !== '') fields["Fin"]        = body.end.toString();
  if (body.lunch     !== undefined && body.lunch     !== '') fields["Dîner"]      = body.lunch.toString();
  if (body.pause     !== undefined && body.pause     !== '') fields["Pause"]      = body.pause.toString();
  if (body.notes     !== undefined)                          fields["Notes"]      = body.notes;
  if (body.adminNote !== undefined)                          fields["Note Admin"] = body.adminNote;
  if (body.approved  !== undefined)                          fields["Approuvé"]   = body.approved === true;

  try {
    // PATCH direct si recordId connu
    if (body.recordId) {
      try {
        await axios.patch(`${baseUrl}/${body.recordId}`, { fields }, { headers });
        return res.status(200).json({ message: 'OK', recordId: body.recordId });
      } catch (e) {
        if (e.response?.status !== 404 && e.response?.status !== 422) throw e;
      }
    }

    // Recherche par date + employé
    const filter = `{Date}='${date}'`;
    const searchRes = await axios.get(`${baseUrl}?filterByFormula=${encodeURIComponent(filter)}`, { headers });
    const empRecords = searchRes.data.records.filter(r => (r.fields['Employé'] || []).includes(empId));

    // Déduplication
    if (empRecords.length > 1) {
      await Promise.all(empRecords.slice(1).map(r => axios.delete(`${baseUrl}/${r.id}`, { headers })));
    }

    if (empRecords[0]) {
      await axios.patch(`${baseUrl}/${empRecords[0].id}`, { fields }, { headers });
      return res.status(200).json({ message: 'OK', recordId: empRecords[0].id });
    }

    // Créer seulement si données présentes — avec Employé uniquement à la création
    const hasContent = (body.start && body.start !== '') || (body.end && body.end !== '') || (body.notes && body.notes !== '');
    if (hasContent) {
      const created = await axios.post(baseUrl, { fields: { ...fields, "Employé": [empId] } }, { headers });
      return res.status(200).json({ message: 'OK', recordId: created.data.id });
    }

    return res.status(200).json({ message: 'Skip' });

  } catch (error) {
    const detail = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error(`ERREUR AIRTABLE:`, detail);
    return res.status(error.response?.status || 500).json({ error: detail });
  }
}
