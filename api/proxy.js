export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { key, gb, q, pagecnt = 3 } = req.query;
  if (!key || !q) { res.status(400).json({ error: 'key and q are required' }); return; }

  try {
    // key는 인코딩 없이 그대로, q만 인코딩
    const url = `https://bizno.net/api/fapi?key=${key}&gb=${gb||1}&q=${encodeURIComponent(q)}&type=json&pagecnt=${pagecnt}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const text = await response.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(response.status).send(text);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
