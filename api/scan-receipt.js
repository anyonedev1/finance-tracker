// /api/scan-receipt.js
// Vercel env vars: GEMINI_API_KEY (обязательно), SUPABASE_SERVICE_ROLE_KEY (опционально, для обучения)

const SUPABASE_URL = 'https://xscuojyubgnilmufesvx.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY не настроен на сервере' });

  const { images, householdId } = req.body || {};
  // images: [{ data: base64, mediaType }, ...] — одна или несколько фото (для длинных чеков)
  if (!Array.isArray(images) || !images.length) return res.status(400).json({ error: 'Нет изображения' });

  let examplesText = '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey && householdId) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/receipt_corrections?household_id=eq.${householdId}&order=created_at.desc&limit=5`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
      );
      const corrections = await r.json();
      if (Array.isArray(corrections) && corrections.length) {
        examplesText = '\n\nРанее ИИ иногда ошибался для этого пользователя, примеры исправлений:\n' +
          corrections.map(c => `- предположил категорию "${c.ai_category}", а на деле "${c.final_category}"`).join('\n');
      }
    } catch (e) { /* не критично */ }
  }

  const multiNote = images.length > 1 ? `Это ${images.length} фото ОДНОГО длинного чека, сфотографированного по частям подряд (чек не поместился в один кадр). Склей их мысленно в один список товаров.` : 'Это фото одного чека.';

  const prompt = `Посмотри на фото чека. ${multiNote}
Верни ТОЛЬКО JSON без markdown, без пояснений, строго такого вида:
{"amount": число или null, "store": "название магазина" или null, "currency": "RUB" или "USD" или "EUR" или "BYN" или null, "category": одно из ["Еда","Транспорт","Жильё","Развлечения","Здоровье","Покупки","Связь","Другое"], "confidence": "high" или "low", "unclear_field": "amount" или "category" или null, "items": ["товар 1", "товар 2"], "advice": "один короткий дружелюбный совет на русском по этим конкретным покупкам, с конкретикой, не банальность"}
amount — это итоговая сумма к оплате (обычно самая крупная цифра внизу чека / на последнем фото, рядом со словом "Итого"/"Total"/"К оплате").
items — краткий список из 3-6 самых заметных позиций (не более 4 слов на позицию).
confidence: "high" только если уверен и в сумме, и в категории. Иначе "low" и укажи unclear_field.${examplesText}`;

  try {
    const parts = [{ text: prompt }, ...images.map(img => ({ inline_data: { mime_type: img.mediaType || 'image/jpeg', data: img.data } }))];
    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 600, responseMimeType: 'application/json' },
        }),
      }
    );

    const data = await aiRes.json();
    if (!aiRes.ok) return res.status(502).json({ error: data.error?.message || 'Ошибка ИИ' });

    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    const parsed = extractJson(text);
    if (!parsed) return res.status(502).json({ error: 'Не удалось разобрать ответ ИИ: ' + text.slice(0, 200) });

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Внутренняя ошибка' });
  }
}

function extractJson(text) {
  if (!text) return null;
  let cleaned = text.replace(/```json|```/gi, '').trim();
  try { return JSON.parse(cleaned); } catch (e) { /* пробуем достать блок вручную */ }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (e) { return null; }
}
