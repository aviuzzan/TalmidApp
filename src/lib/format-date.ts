// Formatage des dates localisé FR / EN / HE (portail famille).
// Usage : fmtDate(date, lang) avec lang issu de useI18n().

export function fmtDate(d: string | Date | null | undefined, lang: string): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(lang === 'he' ? 'he-IL' : lang === 'en' ? 'en-GB' : 'fr-FR')
}

// Locale à passer à toLocaleDateString/toLocaleString quand on a besoin
// d'options de format (weekday, heure...) non couvertes par fmtDate.
export function dateLocale(lang: string): string {
  return lang === 'he' ? 'he-IL' : lang === 'en' ? 'en-GB' : 'fr-FR'
}
