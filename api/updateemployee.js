const axios = require('axios');

// POST /api/updateEmployee
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const body = req.body;
  const { airtableId } = body;

  if (!airtableId) {
    return res.status(400).json({ error: 'airtableId requis' });
  }

  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;
  const TABLE_NAME = encodeURIComponent("Employés");

  const headers = {
    Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    'Content-Type': 'application/json'
  };

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}/${airtableId}`;

  const fields = {};
  if (body.inputMode      !== undefined) fields['Mode saisie']     = body.inputMode;
  if (body.autoFill       !== undefined) fields['AutoFill']        = body.autoFill;
  if (body.partTime       !== undefined) fields['Temps partiel']   = body.partTime;
  if (body.password       !== undefined) fields['Mot de passe']    = body.password ?? '';
  if (body.reminderCount  !== undefined) fields['Compteur Rappel'] = body.reminderCount;

  if (Object.keys(fields).length === 0) {
    return res.status(200).json({ message: 'Rien à mettre à jour' });
  }

  try {
    await axios.patch(url, { fields }, { headers });
    console.log(`updateEmployee OK: ${airtableId}`, fields);
    return res.status(200).json({ message: 'OK' });
  } catch (error) {
    const detail = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('ERREUR updateEmployee:', detail);
    return res.status(500).json({ error: detail });
  }
}
