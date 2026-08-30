// /api/scan-receipt.js
// Требует переменную окружения ANTHROPIC_API_KEY в Vercel (Settings -> Environment Variables).
// Получить ключ: console.anthropic.com -> Settings -> API Keys.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY не настроен на сервере' });

  const { imageBase64, mediaType } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: 'Нет изображения' });

  const prompt = `Посмотри на фото чека. Верни ТОЛЬКО JSON без markdown, без пояснений, строго такого вида:
{"amount": число или null, "store": "название магазина" или null, "currency": "RUB" или "USD" или "EUR" или "BYN" или null, "category": одно из ["Еда","Транспорт","Жильё","Развлечения","Здоровье","Покупки","Связь","Другое"], "confidence": "high" или "low"}
amount — это итоговая сумма к оплате (обычно самая крупная цифра внизу чека, рядом со словом "Итого"/"Total"/"К оплате"). Если не уверен — confidence: "low".`;

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    const data = await aiRes.json();
    if (!aiRes.ok) return res.status(502).json({ error: data.error?.message || 'Ошибка ИИ' });

    const text = (data.content || []).map(b => b.text || '').join('').trim();
    const cleaned = text.replace(/```json|```/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(cleaned); } catch (e) { return res.status(502).json({ error: 'Не удалось разобрать ответ ИИ' }); }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Внутренняя ошибка' });
  }
}
