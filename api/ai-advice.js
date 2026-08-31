// /api/ai-advice.js
// Использует тот же бесплатный ключ GEMINI_API_KEY, что и сканер чеков.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY не настроен на сервере' });

  const { summary, income, expense, salary, budget } = req.body || {};

  const prompt = `Ты — финансовый советник в приложении для учёта личных расходов. Вот данные пользователя:
Расходы по категориям: ${summary || 'нет данных'}
Общий доход за всё время: ${income || 0} ₽
Общий расход за всё время: ${expense || 0} ₽
Зарплата в месяц: ${salary || 'не указана'}
Месячный бюджет: ${budget || 'не задан'}

Дай 3-4 коротких, конкретных и дружелюбных совета на русском языке, как сэкономить, основываясь именно на этих данных (называй конкретные категории и суммы). Без воды, без общих фраз типа "ведите бюджет". Каждый совет — 1-2 предложения.
Верни ТОЛЬКО JSON без markdown, строго вида: {"tips": ["совет 1", "совет 2", "совет 3"]}`;

  try {
    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4 },
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
