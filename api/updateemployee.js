const axios = require('axios');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const body = req.body;
  const { airtableId } = body;

  if (!airtableId) {
    return res.status(400).json({ error: 'airtableId requis' });
  }

  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, TRACCAR_TOKEN } = process.env;
  const TABLE_NAME = encodeURIComponent("Employés");

  const headers = {
    Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    'Content-Type': 'application/json'
  };

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}/${airtableId}`;

  // ── 1. Mettre à jour les champs Airtable ──────────────────────────────────
  const fields = {};
  if (body.inputMode    !== undefined) fields['Mode saisie']    = body.inputMode;
  if (body.autoFill     !== undefined) fields['AutoFill']       = body.autoFill;
  if (body.partTime     !== undefined) fields['Temps partiel']  = body.partTime;
  if (body.password     !== undefined) fields['Mot de passe']   = body.password ?? '';
  if (body.sendReminder !== undefined) fields['Envoyer Rappel'] = body.sendReminder === true;
  if (body.archived     !== undefined) fields['Archivé']        = body.archived === true;
  if (body.exitDate     !== undefined) fields['Date de sortie'] = body.exitDate || '';
  if (body.adminNotes   !== undefined) fields['Notes']          = body.adminNotes;

  if (Object.keys(fields).length > 0) {
    try {
      await axios.patch(url, { fields }, { headers });
      console.log(`updateEmployee OK: ${airtableId}`, fields);
    } catch (error) {
      const detail = error.response ? JSON.stringify(error.response.data) : error.message;
      console.error('ERREUR updateEmployee:', detail);
      return res.status(500).json({ error: detail });
    }
  }

  // ── 2. Envoyer un SMS si sendReminder=true ────────────────────────────────
  if (body.sendReminder === true) {
    const phone   = body.phone   || '';
    const message = body.message || "Rappel : n'oublie pas de soumettre ta feuille de temps. Merci!";

    if (!phone) {
      console.warn(`SMS ignoré pour ${airtableId} — aucun numéro de téléphone`);
      return res.status(200).json({ message: 'OK (pas de téléphone)' });
    }

    if (!TRACCAR_TOKEN) {
      console.warn('TRACCAR_TOKEN manquant — SMS non envoyé');
      return res.status(200).json({ message: 'OK (TRACCAR_TOKEN absent)' });
    }

    try {
      const smsResp = await axios.post(
        'https://sms.traccar.org/message',
        { to: phone, message },
        { headers: { Authorization: `Bearer ${TRACCAR_TOKEN}`, 'Content-Type': 'application/json' } }
      );
      console.log(`SMS envoyé à ${phone}:`, smsResp.status);
      return res.status(200).json({ message: 'OK', sms: 'sent' });
    } catch (smsErr) {
      const detail = smsErr.response ? JSON.stringify(smsErr.response.data) : smsErr.message;
      console.error('ERREUR SMS Traccar:', detail);
      return res.status(200).json({ message: 'OK', sms: 'error', smsError: detail });
    }
  }

  return res.status(200).json({ message: 'OK' });
};
