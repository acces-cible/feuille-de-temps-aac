const axios = require('axios');

// GET /api/getphotos?recordId=recXXXX
// Returns fresh photo URLs for a given record (Airtable URLs expire after ~2h)
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { recordId } = req.query;
  if (!recordId) return res.status(400).json({ error: 'recordId requis' });

  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;
  const TABLE_NAME = encodeURIComponent('Feuilles de temps');

  try {
    const r = await axios.get(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}/${recordId}`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    );
    const photos = r.data.fields['Photo camera'] || [];
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(photos);
  } catch (e) {
    const detail = e.response ? JSON.stringify(e.response.data) : e.message;
    console.error('getphotos error:', detail);
    return res.status(e.response?.status || 500).json({ error: detail });
  }
};
