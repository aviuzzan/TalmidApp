'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export function useInscriptionsConfig(ecoleId: string, annee: string) {
  const [config, setConfig] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!ecoleId) return
    createClient()
      .from('inscriptions_config')
      .select('*')
      .eq('ecole_id', ecoleId)
      .eq('annee_scolaire', annee)
      .single()
      .then(({ data }) => { setConfig(data); setLoading(false) })
  }, [ecoleId, annee])

  return { config, loading }
}

export function useSecteurs(ecoleId: string) {
  const [secteurs, setSecteurs] = useState<any[]>([])
  useEffect(() => {
    if (!ecoleId) return
    createClient()
      .from('secteurs')
      .select('*, classes(*)')
      .eq('ecole_id', ecoleId)
      .eq('actif', true)
      .order('ordre')
      .then(({ data }) => setSecteurs(data ?? []))
  }, [ecoleId])
  return secteurs
}

export function useTarifs(ecoleId: string, annee: string) {
  const [tarifs, setTarifs] = useState<any[]>([])
  useEffect(() => {
    if (!ecoleId) return
    createClient()
      .from('tarifs_secteur')
      .select('*, secteurs(nom)')
      .eq('ecole_id', ecoleId)
      .eq('annee_scolaire', annee)
      .order('ordre')
      .then(({ data }) => setTarifs(data ?? []))
  }, [ecoleId, annee])
  return tarifs
}

export function useModesReglement(ecoleId: string) {
  const [modes, setModes] = useState<any[]>([])
  useEffect(() => {
    if (!ecoleId) return
    createClient()
      .from('modes_reglement_ecole')
      .select('*')
      .eq('ecole_id', ecoleId)
      .eq('actif', true)
      .order('ordre')
      .then(({ data }) => setModes(data ?? []))
  }, [ecoleId])
  return modes
}

export const ANNEE_COURANTE = '2026-2027'

export function formatStatut(statut: string) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    brouillon:   { label: 'Brouillon',   color: '#64748B', bg: 'rgba(100,116,139,0.12)' },
    soumis:      { label: 'Soumis',      color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
    en_etude:    { label: 'En étude',    color: '#0891B2', bg: 'rgba(8,145,178,0.12)' },
    accepte:     { label: 'Accepté',     color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
    refuse:      { label: 'Refusé',      color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
    valide:      { label: 'Validé',      color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
    annule:      { label: 'Annulé',      color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
  }
  return map[statut] ?? { label: statut, color: '#64748B', bg: 'rgba(100,116,139,0.12)' }
}
