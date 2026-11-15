const axios = require('axios');

// POST /api/uploadphoto
// Body: { recordId, filename, mimeType, data (base64) }
// Airtable Content API: JSON body with base64 file (NOT multipart)
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { recordId, filename, mimeType, data } = req.body;
  if (!recordId || !data) return res.status(400).json({ error: 'recordId et data requis' });

  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;
  const FIELD_ID = 'fldd1MkqejnEefT7K';

  const uploadUrl = `https://content.airtable.com/v0/${AIRTABLE_BASE_ID}/${recordId}/${FIELD_ID}/uploadAttachment`;

  try {
    const response = await axios.post(uploadUrl, {
      contentType: mimeType || 'image/jpeg',
      file: data,
      filename: filename || 'photo.jpg',
    }, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      maxBodyLength: Infinity,
    });
    // Response is the full updated record; extract the last attachment
    const attachments = response.data.fields && response.data.fields[FIELD_ID];
    const att = attachments && attachments[attachments.length - 1];
    return res.status(200).json(att || response.data);
  } catch (e) {
    const detail = e.response ? JSON.stringify(e.response.data) : e.message;
    console.error('uploadphoto error:', detail);
    return res.status(e.response?.status || 500).json({ error: detail });
  }
};
