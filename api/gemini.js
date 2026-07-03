// Vercel Serverless Function — ให้เว็บ production ยิง AI ได้โดยไม่ต้องรัน backend เอง
// (เดิมมีแค่ backend/server.js ที่ localhost:3001 ซึ่งใช้ได้เฉพาะเปิดเว็บผ่าน LAN)
//
// ใช้ OpenRouter แทน Gemini โดยตรง (เปลี่ยนจาก @google/genai) — เลือก Qwen3 Next 80B
// เพราะมีรอบ post-training เพิ่ม fluency ภาษาไทยโดยเฉพาะ และเป็น free tier
// endpoint path คงชื่อ /api/gemini ไว้เพื่อไม่ต้องแก้จุดเรียกใช้ฝั่ง frontend เพิ่ม
const OPENROUTER_MODEL = "qwen/qwen3-next-80b-a3b-instruct:free";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

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

  try {
    const orRes = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://weather-beta-eosin.vercel.app",
        "X-Title": "SolarAqua RiceFarm Advisor",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await orRes.json();
    if (!orRes.ok) {
      res.status(orRes.status).json({ error: data?.error?.message || "OpenRouter error" });
      return;
    }

    const text = data?.choices?.[0]?.message?.content || "";
    res.status(200).json({ result: text });
  } catch (err) {
    console.error("[OpenRouter]", err.message);
    res.status(500).json({ error: err.message });
  }
}
