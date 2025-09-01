// api/feishu.js
module.exports = async (req, res) => {
  // CORS（同域其实可省略）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  // 体检：GET /api/feishu?diag=1
  if (req.method === 'GET') {
    const hasEnv = !!process.env.FEISHU_WEBHOOK_URL;
    return res.status(200).json({
      ok: true,
      env_ready: hasEnv,
      tip: hasEnv ? 'FEISHU_WEBHOOK_URL 已配置'
                  : '缺少 FEISHU_WEBHOOK_URL，请到 Vercel Settings→Environment Variables 配置后 Redeploy'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const WEBHOOK_URL = process.env.FEISHU_WEBHOOK_URL;
  if (!WEBHOOK_URL) {
    return res.status(500).json({ ok: false, error: 'Missing FEISHU_WEBHOOK_URL env' });
  }

  try {
    // 解析 body：优先 req.body；为空则读原始数据
    let body = req.body;
    if (!body || typeof body !== 'object') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8') || '';
      try { body = raw ? JSON.parse(raw) : {}; } catch { body = { text: raw }; }
    }

    const { msgType = 'text', text, card } = body;
    const payload = (msgType === 'interactive' && card)
      ? { msg_type: 'interactive', card }
      : { msg_type: 'text', content: { text: text || '[空消息]' } };

    const upstream = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const upstreamText = await upstream.text();
    if (!upstream.ok) {
      console.error('Feishu upstream error:', upstream.status, upstreamText);
      return res.status(502).json({
        ok: false,
        upstream_status: upstream.status,
        upstream: upstreamText
      });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Handler exception:', e);
    return res.status(500).json({ ok: false, error: String(e) });
  }
};
