/**
 * Route API du chatbot.
 *
 * POST /api/chatbot/ask
 * Header: Authorization: Bearer <token>
 * Body: { question: string }
 * Retourne: { reponse: string, conversationId: string }
 */
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { chargerContexteChatbot, construirePromptSysteme } from '@/lib/chatbot-contexte'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json()
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return NextResponse.json({ error: 'Question requise' }, { status: 400 })
    }
    if (question.length > 1000) {
      return NextResponse.json({ error: 'Question trop longue (max 1000 caracteres)' }, { status: 400 })
    }

    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // Auth Bearer token
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    const { data: { user } } = await supa.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

    // Charge contexte filtre par permissions
    const ctx = await chargerContexteChatbot(supa, user.id)
    if (!ctx) return NextResponse.json({ error: 'Contexte introuvable' }, { status: 404 })

    // Resoudre ecole_id pour config et logging
    const { data: profileBase } = await supa
      .from('profiles')
      .select('ecole_id, famille_id')
      .eq('id', user.id)
      .single()
    let ecoleId = profileBase?.ecole_id
    if (!ecoleId && profileBase?.famille_id) {
      const { data: f } = await supa.from('familles').select('ecole_id').eq('id', profileBase.famille_id).single()
      ecoleId = f?.ecole_id
    }

    // Verifie que le chatbot est active pour l ecole
    const { data: config } = await supa
      .from('chatbot_config_ecole')
      .select('active, limite_parent_par_jour, modele')
      .eq('ecole_id', ecoleId)
      .maybeSingle()
    if (!config?.active) {
      return NextResponse.json({ error: 'Le chatbot n est pas active pour votre ecole' }, { status: 403 })
    }

    // Quota journalier pour parents
    if (ctx.role === 'parent') {
      const debutJour = new Date()
      debutJour.setHours(0, 0, 0, 0)
      const { count } = await supa
        .from('chatbot_conversations')
        .select('*', { count: 'exact', head: true })
        .eq('profile_id', user.id)
        .gte('created_at', debutJour.toISOString())
      const limite = config.limite_parent_par_jour ?? 30
      if ((count ?? 0) >= limite) {
        return NextResponse.json({ error: `Limite journaliere atteinte (${limite} questions). Reessayez demain.` }, { status: 429 })
      }
    }

    // Appel Gemini Flash 2.0
    // Bascule Groq Llama : gratuit illimite, 30 RPM, OpenAI-compatible. Fallback Gemini si GROQ pas configure.
    const groqKey = process.env.GROQ_API_KEY
    const googleKey = process.env.GOOGLE_AI_API_KEY
    if (!groqKey && !googleKey) {
      return NextResponse.json({ error: 'Aucune cle LLM configuree (GROQ_API_KEY ou GOOGLE_AI_API_KEY)' }, { status: 500 })
    }

    const prompt = construirePromptSysteme(ctx)

    // Modeles supportes :
    //  - llama-3.3-70b-versatile : Groq, gratuit, FR excellent, 30 RPM, recommande
    //  - llama-3.1-8b-instant : Groq, plus rapide, 30 RPM
    //  - gemini-* : Google AI fallback
    const modeleStock = config.modele && config.modele !== 'gemini-flash-2.0' ? config.modele : 'llama-3.3-70b-versatile'
    const useGroq = modeleStock.startsWith('llama') || modeleStock.startsWith('mixtral') || modeleStock.startsWith('gemma')

    let resp: Response
    if (useGroq && groqKey) {
      // Groq API (OpenAI compatible)
      resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: modeleStock,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: question },
          ],
          temperature: 0.3,
          max_tokens: 800,
        }),
      })
    } else {
      // Google Gemini fallback
      if (!googleKey) {
        return NextResponse.json({ error: 'Modele Groq demande mais GROQ_API_KEY manquante' }, { status: 500 })
      }
      resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modeleStock}:generateContent?key=${googleKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: question }] }],
          systemInstruction: { parts: [{ text: prompt }] },
          generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
        }),
      })
    }

    if (!resp.ok) {
      const errTxt = await resp.text()
      console.error('LLM error', resp.status, errTxt)
      let detail = errTxt.slice(0, 300)
      try {
        const errJson = JSON.parse(errTxt)
        detail = errJson?.error?.message || errJson?.error?.status || detail
      } catch { /* keep raw */ }
      return NextResponse.json({ error: `Erreur LLM (${resp.status}) : ${detail}` }, { status: 502 })
    }

    const data = await resp.json()
    // Format Groq (OpenAI) vs Gemini : on extrait des deux
    const reponse: string = data?.choices?.[0]?.message?.content
      || data?.candidates?.[0]?.content?.parts?.[0]?.text
      || 'Je n ai pas pu generer de reponse.'
    const tokensInput = data?.usage?.prompt_tokens ?? data?.usageMetadata?.promptTokenCount ?? null
    const tokensOutput = data?.usage?.completion_tokens ?? data?.usageMetadata?.candidatesTokenCount ?? null

    // Sauvegarde
    const { data: conv } = await supa
      .from('chatbot_conversations')
      .insert({
        ecole_id: ecoleId,
        profile_id: user.id,
        role_user: ctx.role,
        question: question.trim(),
        reponse,
        tokens_input: tokensInput,
        tokens_output: tokensOutput,
      })
      .select('id')
      .single()

    return NextResponse.json({ reponse, conversationId: conv?.id })
  } catch (e: any) {
    console.error('Chatbot ask error', e)
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 })
  }
}
