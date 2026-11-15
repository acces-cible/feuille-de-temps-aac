const axios = require('axios');
const FormData = require('form-data');

// POST /api/uploadphoto
// Body: { recordId, filename, mimeType, data (base64) }
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { recordId, filename, mimeType, data } = req.body;
  if (!recordId || !data) return res.status(400).json({ error: 'recordId et data requis' });

  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;
  const FIELD_ID = 'fldd1MkqejnEefT7K';

  const buffer = Buffer.from(data, 'base64');
  const form = new FormData();
  form.append('file', buffer, {
    filename: filename || 'photo.jpg',
    contentType: mimeType || 'image/jpeg',
  });
  form.append('filename', filename || 'photo.jpg');

  const uploadUrl = `https://content.airtable.com/v0/${AIRTABLE_BASE_ID}/${recordId}/${FIELD_ID}/uploadAttachment`;

  try {
    const response = await axios.post(uploadUrl, form, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        ...form.getHeaders(),
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    return res.status(200).json(response.data);
  } catch (e) {
    const detail = e.response ? JSON.stringify(e.response.data) : e.message;
    console.error('uploadphoto error:', detail);
    return res.status(e.response?.status || 500).json({ error: detail });
  }
};
