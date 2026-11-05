const axios = require('axios');

// DELETE /api/deleterecord
// Body: { recordId: "recXXXX" }  — ou —  { empId: "recXXXX", date: "YYYY-MM-DD" }
module.exports = async function handler(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { recordId, empId, date } = req.body || {};

  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return res.status(500).json({ error: 'Variables environnement manquantes' });
  }

  const TABLE_NAME = encodeURIComponent("Feuilles de temps");
  const headers = { Authorization: `Bearer ${AIRTABLE_TOKEN}` };
  const baseUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}`;

  try {
    // Cas 1 : on connaît l'ID direct
    if (recordId) {
      await axios.delete(`${baseUrl}/${recordId}`, { headers });
      console.log(`DELETE OK: ${recordId}`);
      return res.status(200).json({ message: 'deleted', recordId });
    }

    // Cas 2 : on cherche par employé + date
    if (empId && date) {
      const filter = `{Date}='${date}'`;
      const searchRes = await axios.get(
        `${baseUrl}?filterByFormula=${encodeURIComponent(filter)}`,
        { headers }
      );
      const toDelete = searchRes.data.records.filter(r =>
        (r.fields['Employé'] || []).includes(empId)
      );
      await Promise.all(toDelete.map(r => axios.delete(`${baseUrl}/${r.id}`, { headers })));
      console.log(`DELETE par date: ${toDelete.length} enregistrement(s) supprimé(s)`);
      return res.status(200).json({ message: 'deleted', count: toDelete.length });
    }

    return res.status(400).json({ error: 'recordId ou (empId + date) requis' });

  } catch (error) {
    const detail = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('ERREUR DELETE:', detail);
    return res.status(error.response?.status || 500).json({ error: detail });
  }
};
