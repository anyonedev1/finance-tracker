// /api/ai-advice.js
// Использует тот же бесплатный ключ GEMINI_API_KEY, что и сканер чеков.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY не настроен на сервере' });

  const { monthSummary, topItems, income, expense, salary, budget, budgetUsedPct, daysLeftInMonth, goals } = req.body || {};

  const prompt = `Ты — личный финансовый советник в приложении "Копилка". Все суммы ниже в рублях (RUB). Вот РЕАЛЬНЫЕ данные пользователя за текущий месяц:

Траты по категориям в этом месяце: ${monthSummary || 'пока нет операций в этом месяце'}
Самые частые/крупные покупки (комментарии к операциям): ${topItems || 'нет данных'}
Зарплата в месяц: ${salary || 'не указана'} ₽
Месячный бюджет на расходы: ${budget || 'не задан'} ₽
Использовано от бюджета: ${budgetUsedPct != null ? budgetUsedPct + '%' : 'бюджет не задан'}
Осталось дней до конца месяца: ${daysLeftInMonth || '?'}
Активные цели накоплений: ${goals || 'нет целей'}

Дай 3-4 совета на русском. ТРЕБОВАНИЯ, обязательно соблюдай все:
1. Каждый совет должен ссылаться на КОНКРЕТНУЮ категорию/сумму/цель из данных выше — никаких общих фраз без цифр.
2. Хотя бы один совет должен содержать простую математику: сколько денег реально можно сэкономить в рублях, если сократить конкретную категорию на разумный процент.
3. Если бюджет почти исчерпан или дней до конца месяца мало — упомяни это прямо и дай конкретную цифру, сколько можно тратить в день оставшееся время.
4. Если есть активная цель накоплений — предложи, из какой категории расходов можно перенаправить деньги на неё, с конкретной суммой.
5. Никаких банальностей вроде "ведите бюджет" или "экономьте больше" без цифр — это запрещено.
6. Пиши тепло и по-дружески, но по делу. Каждый совет 1-2 предложения.

Верни ТОЛЬКО JSON без markdown, строго вида: {"tips": ["совет 1", "совет 2", "совет 3"]}`;

  try {
    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 500 },
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
