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

  // Champs à mettre à jour — sans Employé
  const fields = {};
  fields["Date"] = date;
  if (body.forceWrite) {
    // Effacement explicite — écrire même les valeurs vides
    fields["Début"] = body.start || '';
    fields["Fin"]   = body.end   || '';
    fields["Dîner"] = body.lunch || '';
    fields["Pause"] = body.pause || '';
    fields["Notes"] = body.notes || '';
  } else {
    if (body.start !== undefined && body.start !== '') fields["Début"] = body.start.toString();
    if (body.end   !== undefined && body.end   !== '') fields["Fin"]   = body.end.toString();
    if (body.lunch !== undefined && body.lunch !== '') fields["Dîner"] = body.lunch.toString();
    if (body.pause !== undefined && body.pause !== '') fields["Pause"] = body.pause.toString();
    if (body.notes !== undefined)                      fields["Notes"] = body.notes;
  }
  if (body.adminNote !== undefined) fields["Note Admin"] = body.adminNote;
  if (body.approved  !== undefined) fields["Approuvé"]   = body.approved === true;

  try {
    // ── 1. PATCH direct si recordId connu (chemin rapide) ────────────────────
    if (body.recordId) {
      try {
        await axios.patch(`${baseUrl}/${body.recordId}`, { fields }, { headers });
        console.log(`PATCH direct OK: ${body.recordId}`);
        return res.status(200).json({ message: 'OK', recordId: body.recordId });
      } catch (e) {
        if (e.response?.status !== 404 && e.response?.status !== 422) throw e;
        console.warn(`PATCH ${body.recordId} échoué (${e.response?.status}), fallback recherche`);
      }
    }

    // ── 2. Recherche par AND(date, employé) directement dans Airtable ────────
    // On filtre les deux critères côté Airtable pour éviter les problèmes de
    // pagination : si la table a des centaines de lignes pour une même date,
    // un filtre sur date seule + filtre JS ne verrait que la première page.
    const filter = encodeURIComponent(
      `AND({Date}='${date}', FIND('${empId}', ARRAYJOIN({Employé}, ',')))`
    );
    const searchRes = await axios.get(`${baseUrl}?filterByFormula=${filter}`, { headers });
    const empRecords = searchRes.data.records;

    console.log(`Trouvé ${empRecords.length} record(s) pour ${empId} / ${date}`);

    // Déduplication : garder le premier, supprimer les doublons
    if (empRecords.length > 1) {
      await Promise.all(empRecords.slice(1).map(r =>
        axios.delete(`${baseUrl}/${r.id}`, { headers })
      ));
      console.log(`Dédupliqué: ${empRecords.length - 1} doublon(s) supprimé(s)`);
    }

    if (empRecords[0]) {
      await axios.patch(`${baseUrl}/${empRecords[0].id}`, { fields }, { headers });
      console.log(`PATCH OK: ${empRecords[0].id}`);
      return res.status(200).json({ message: 'OK', recordId: empRecords[0].id });
    }

    // ── 3. Créer seulement si des données sont présentes ─────────────────────
    const hasContent = (body.start && body.start !== '')
                    || (body.end   && body.end   !== '')
                    || (body.notes && body.notes !== '');

    if (hasContent) {
      const fieldsWithEmp = { ...fields, "Employé": [empId] };
      const created = await axios.post(baseUrl, { fields: fieldsWithEmp }, { headers });
      console.log(`POST OK: ${created.data.id}`);
      return res.status(200).json({ message: 'OK', recordId: created.data.id });
    }

    console.log('Skip: aucune donnée');
    return res.status(200).json({ message: 'Skip' });

  } catch (error) {
    const detail = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error(`ERREUR AIRTABLE:`, detail);
    return res.status(error.response?.status || 500).json({ error: detail });
  }
}
