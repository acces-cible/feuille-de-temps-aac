const axios = require('axios');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;
  const TABLE_NAME = encodeURIComponent("Employés");

  try {
    const response = await axios.get(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    );

    const employees = response.data.records.map(r => ({
      id:            r.id,
      airtableId:    r.id,
      name:          r.fields['Nom AI']        || 'Sans nom',
      email:         r.fields['Courriel']      || '',
      phone:         r.fields['Téléphone']     || '',
      partTime:      r.fields['Temps partiel'] === true,
      inputMode:     r.fields['Mode saisie']   || 'clock',
      autoFill:      r.fields['AutoFill']      === true,
      reminderCount: r.fields['Rappels']       || 0,
    }));

    return res.status(200).json(employees);

  } catch (error) {
    const detail = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('ERREUR getEmployees:', detail);
    return res.status(500).json({ error: detail });
  }
}