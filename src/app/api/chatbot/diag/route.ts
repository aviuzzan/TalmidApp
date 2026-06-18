/**
 * Route diagnostic chatbot : liste les modeles disponibles pour la cle Google AI.
 * GET /api/chatbot/diag
 * Pour ouvrir directement dans le navigateur quand on debug le chatbot.
 */
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GOOGLE_AI_API_KEY manquante' }, { status: 500 })

  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
    if (!resp.ok) {
      const txt = await resp.text()
      return NextResponse.json({ status: resp.status, raw: txt }, { status: resp.status })
    }
    const data = await resp.json()
    // Filtre uniquement ceux qui supportent generateContent
    const generateModels = (data?.models || [])
      .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map((m: any) => ({
        name: m.name,
        displayName: m.displayName,
        version: m.version,
        inputTokenLimit: m.inputTokenLimit,
      }))
    return NextResponse.json({
      total: data?.models?.length || 0,
      generateContentModels: generateModels,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
