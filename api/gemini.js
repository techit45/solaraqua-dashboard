// Vercel Serverless Function — ให้เว็บ production ยิง AI ได้โดยไม่ต้องรัน backend เอง
// (เดิมมีแค่ backend/server.js ที่ localhost:3001 ซึ่งใช้ได้เฉพาะเปิดเว็บผ่าน LAN)
//
// ใช้ OpenRouter แทน Gemini โดยตรง (เปลี่ยนจาก @google/genai)
// ลองโมเดลตามลำดับ — Qwen3 มี post-training เพิ่ม fluency ภาษาไทยโดยเฉพาะ เลยเป็นตัวหลัก
// แต่ free tier ของ OpenRouter เจอ provider (Venice) ที่เสิร์ฟ Qwen3/Llama/Hermes ล่ม/แน่นบ่อย
// (ทดสอบจริงเจอ 429 ข้ามหลายโมเดลที่ผ่าน Venice พร้อมกัน — ไม่ใช่ปัญหาบัญชี) จึงมี fallback
// ไป Nemotron Nano (เสิร์ฟโดย Nvidia เอง คนละ provider ไม่ค่อยชนคิว) กันพังตอน Venice แน่น
const MODELS = [
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "nvidia/nemotron-nano-9b-v2:free",
];
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

async function callOpenRouter(model, apiKey, prompt) {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://weather-beta-eosin.vercel.app",
      "X-Title": "SolarAqua RiceFarm Advisor",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "OPENROUTER_API_KEY not configured" });
    return;
  }

  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "Missing prompt" });
    return;
  }

  let last = null;
  try {
    for (const model of MODELS) {
      last = await callOpenRouter(model, apiKey, prompt);
      if (last.ok) {
        const text = last.data?.choices?.[0]?.message?.content || "";
        res.status(200).json({ result: text });
        return;
      }
      // 429 = โมเดลนี้ติดคิว/ล่ม ลองตัวถัดไป; error อื่น (เช่น auth ผิด) ไม่มีประโยชน์ที่จะลองซ้ำ
      if (last.status !== 429) break;
      console.warn(`[OpenRouter] ${model} 429, falling back`);
    }
    res.status(last.status).json({ error: last.data?.error?.message || "OpenRouter error" });
  } catch (err) {
    console.error("[OpenRouter]", err.message);
    res.status(500).json({ error: err.message });
  }
}
