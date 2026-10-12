import {requireOwner} from "@/lib/server-auth";
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function GET() {
  const configured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL);
  return NextResponse.json({
    provider: "Google Gemini", configured,
    modelConfigured: Boolean(process.env.GEMINI_MODEL),
    keyConfigured: Boolean(process.env.GEMINI_API_KEY),
    message: configured ? "Gemini is configured. Run a test request to verify access." :
      "Set GEMINI_API_KEY and GEMINI_MODEL in the server environment. Secret values are never returned."
  });
}
export async function POST() {
  const key = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL;
  if (!key || !model) return NextResponse.json({ ok: false, error: "GEMINI_API_KEY and GEMINI_MODEL must both be configured." }, { status: 503 });
  try {
    const ai = new GoogleGenAI({ apiKey: key, httpOptions: { timeout: Math.max(3000, Math.min(30000, Number(process.env.GEMINI_REQUEST_TIMEOUT_MS || 15000))), retryOptions: { attempts: 1 } } });
    const response = await ai.models.generateContent({ model, contents: "Reply with exactly: MyNutri AI connection check", config: { maxOutputTokens: 24, temperature: 0 } });
    if (!response.text) return NextResponse.json({ ok: false, error: "The model returned no text." }, { status: 502 });
    return NextResponse.json({ ok: true, model, checkedAt: new Date().toISOString(), message: "Gemini accepted the test request." });
  } catch (reason) {
    const message = String(reason instanceof Error ? reason.message : reason).toLowerCase();
    const status = message.includes("429") || message.includes("quota") ? 503 : message.includes("timeout") ? 504 : 502;
    const error = status === 503 ? "Gemini quota/rate limit reached." : status === 504 ? "Gemini test request timed out." : "Gemini test failed. Check model availability, project access, and network configuration.";
    return NextResponse.json({ ok: false, error }, { status });
  }
}