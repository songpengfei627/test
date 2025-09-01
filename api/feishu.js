// api/feishu.js
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*'); // 若要限制来源，改成你的前端域名
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(200).send('OK');
  }

  const WEBHOOK_URL = process.env.FEISHU_WEBHOOK_URL; // 在 Vercel 环境变量里配置
  if (!WEBHOOK_URL) {
    return res.status(500).json({ ok: false, error: 'Missing FEISHU_WEBHOOK_URL env' });
  }

  try {
    const { msgType = 'text', text, card } = req.body || {};

    // 组装飞书机器人消息体（无签名）
    const payload =
      msgType === 'interactive' && card
        ? { msg_type: 'interactive', card }
        : { msg_type: 'text', content: { text: text || '[空消息]' } };

    const r = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const bodyText = await r.text(); // 飞书返回通常是 JSON，但用 text 兼容
    if (!r.ok) {
      return res.status(502).json({ ok: false, detail: bodyText });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}
