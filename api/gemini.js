// Vercel Serverless Function — ให้เว็บ production ยิง Gemini ได้โดยไม่ต้องรัน backend เอง
// (เดิมมีแค่ backend/server.js ที่ localhost:3001 ซึ่งใช้ได้เฉพาะเปิดเว็บผ่าน LAN)
import { GoogleGenAI } from "@google/genai";

const GEMINI_MODEL = "gemini-3-flash-preview";
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!ai) {
    res.status(503).json({ error: "GEMINI_API_KEY not configured" });
    return;
  }

  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "Missing prompt" });
    return;
  }

  try {
    const response = await ai.models.generateContent({ model: GEMINI_MODEL, contents: prompt });
    res.status(200).json({ result: response.text });
  } catch (err) {
    console.error("[Gemini]", err.message);
    res.status(500).json({ error: err.message });
  }
}
