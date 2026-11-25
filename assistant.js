import { randomUUID } from 'node:crypto';

export function validate(report, values) {
  if (!values || typeof values !== 'object' || Array.isArray(values) ||
      Object.keys(values).length !== Object.keys(report.parameters).length)
    throw Error('ชุดตัวกรองไม่ตรงกับรายงาน / Invalid filters');
  for (const [name, rule] of Object.entries(report.parameters)) {
    const v = values[name];
    if (!Object.hasOwn(values, name) || typeof v !== rule.type ||
        (rule.type === 'number' && !Number.isFinite(v)) ||
        (rule.type === 'string' && (!v.trim() || v.length > 500)) ||
        (rule.enum && !rule.enum.includes(v)))
      throw Error('ตัวกรองไม่ถูกต้อง / Invalid filter: ' + name);
  }
}

export function assistant(adapter, settings, request = fetch) {
  const sessions = new Map();
  const catalog = { manual: adapter.manual, reports: adapter.reports };
  const system = [
    'You plan read-only reports. Reply in the language of the latest user question (Thai or English).',
    'Return one JSON object only. For ambiguity return {"question":"one short clarification"}.',
    'For questions about the manual or unsupported requests return {"explanation":"answer based only on the catalog"}.',
    'For data requests return {"report":"catalog id","filters":{...all required parameters...}}.',
    'Never invent counts, default thresholds, missing filters or reinterpret unsupported operators. Use user criteria and manual.',
    'Keep prior conditions on follow-up unless changed. Use bare subdistrict names without ตำบล prefix.',
    JSON.stringify(catalog)
  ].join('\n');
  async function run(reportId, filters) {
    const report = adapter.reports.find(r => r.id === reportId);
    if (!report) throw Error('ไม่พบรายงาน / Unknown report');
    validate(report, filters);
    return { report: reportId, filters, rows: await adapter.run(reportId, filters) };
  }
  async function ask({message, sessionId}) {
    if (typeof message !== 'string' || !message.trim() || message.length > 4000)
      throw Error('กรุณาส่งคำถามยาวไม่เกิน 4000 ตัวอักษร / Invalid message');
    const history = sessionId === undefined ? [] : sessions.get(sessionId);
    if (!history) throw Error('กรุณาเริ่มรายงานใหม่ / Session expired');
    const key = process.env.OPENROUTER_API_KEY || settings.apiKey;
    const model = process.env.OPENROUTER_MODEL || settings.model;
    if (!key || !model) throw Error('กรุณาตั้งค่า OpenRouter API key และ model ใน Settings');
    const messages = [...history, {role:'user', content:message}];
    const response = await request('https://openrouter.ai/api/v1/chat/completions', {
      method:'POST', headers:{Authorization:'Bearer ' + key, 'Content-Type':'application/json'},
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({model, messages:[{role:'system', content:system}, ...messages]})
    });
    const data = await response.json().catch(() => ({}));
    const failure = data.error || data.choices?.[0]?.error;
    if (!response.ok || failure) {
      const code = Number(failure?.code || response.status);
      if (code === 402) throw Error('เครดิต OpenRouter ไม่เพียงพอ / Insufficient credits');
      if (code === 429) throw Error('ถึงขีดจำกัดโควตาหรืออัตราคำขอ / Rate or quota limit');
      if (code === 401) throw Error('API key ใช้งานไม่ได้ / Invalid API key');
      throw Error('OpenRouter request failed (' + code + ')');
    }
    let plan;
    try {
      const content = data.choices[0].message.content.trim().replace(/^\x60{3}(?:json)?\s*|\s*\x60{3}$/gi,'');
      plan = JSON.parse(content);
    } catch { throw Error('โมเดลส่งรูปแบบคำตอบไม่ถูกต้อง / Invalid model response'); }
    let result;
    if (typeof plan?.question === 'string' && plan.question.trim()) result = {question:plan.question};
    else if (typeof plan?.explanation === 'string' && plan.explanation.trim()) result = {explanation:plan.explanation};
    else result = await run(plan?.report, plan?.filters);
    const id = sessionId ?? randomUUID();
    // Retain the executed criteria or clarification, never the database rows.
    const {rows, ...context} = result;
    if (!sessions.has(id) && sessions.size >= 100) sessions.delete(sessions.keys().next().value);
    sessions.set(id, [...messages, {role:'assistant', content:JSON.stringify(context)}].slice(-20));
    return {sessionId:id, ...result};
  }
  return { catalog, run, ask };
}
