// /api/scan-receipt.js
// Бесплатный ключ: aistudio.google.com -> Get API key (без привязки карты).
// Добавить в Vercel: Settings -> Environment Variables -> GEMINI_API_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY не настроен на сервере' });

  const { imageBase64, mediaType } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: 'Нет изображения' });

  const prompt = `Посмотри на фото чека. Верни ТОЛЬКО JSON без markdown, без пояснений, строго такого вида:
{"amount": число или null, "store": "название магазина" или null, "currency": "RUB" или "USD" или "EUR" или "BYN" или null, "category": одно из ["Еда","Транспорт","Жильё","Развлечения","Здоровье","Покупки","Связь","Другое"], "confidence": "high" или "low"}
amount — это итоговая сумма к оплате (обычно самая крупная цифра внизу чека, рядом со словом "Итого"/"Total"/"К оплате"). Если не уверен — confidence: "low".`;

  try {
    const model = 'gemini-2.5-flash';
    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mediaType || 'image/jpeg', data: imageBase64 } },
            ],
          }],
          generationConfig: { temperature: 0.1 },
        }),
      }
    );

    const data = await aiRes.json();
    if (!aiRes.ok) return res.status(502).json({ error: data.error?.message || 'Ошибка ИИ' });

    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    const cleaned = text.replace(/```json|```/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(cleaned); } catch (e) { return res.status(502).json({ error: 'Не удалось разобрать ответ ИИ' }); }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Внутренняя ошибка' });
  }
}
