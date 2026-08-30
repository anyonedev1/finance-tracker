// /api/scan-receipt.js
// Бесплатный ключ: aistudio.google.com -> Get API key
// Добавить в Vercel: Settings -> Environment Variables -> GEMINI_API_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY не настроен на сервере' });

  const { imageBase64, mediaType } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: 'Нет изображения' });

  // Убираем из промпта лишние требования про markdown — ИИ сделает это сам благодаря конфигурации
  const prompt = `Посмотри на фото чека. Извлеки данные строго по схеме: 
  {
    "amount": число или null, 
    "store": "название магазина" или null, 
    "currency": "RUB" или "USD" или "EUR" или "BYN" или null, 
    "category": одно из ["Еда","Транспорт","Жильё","Развлечения","Здоровье","Покупки","Связь","Другое"], 
    "confidence": "high" или "low"
  }
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
              {
                inline_data: {
                  // Gemini ожидает mime_type в нижнем регистре со змейкой для REST v1beta
                  mime_type: mediaType || 'image/jpeg',
                  data: imageBase64
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            // ГАРАНТИРУЕТ, что Gemini вернет только валидный JSON без ```json
            response_mime_type: "application/json" 
          }
        })
      }
    );

    const data = await aiRes.json();

    if (!aiRes.ok) {
      return res.status(502).json({ error: data.error?.message || 'Ошибка Gemini API' });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    try {
      // Так как мы указали response_mime_type, здесь будет чистая строка JSON
      const parsed = JSON.parse(text.trim());
      return res.status(200).json(parsed);
    } catch (e) {
      return res.status(502).json({ error: 'Не удалось разобрать JSON, полученный от ИИ', rawText: text });
    }

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Внутренняя ошибка сервера' });
  }
}
