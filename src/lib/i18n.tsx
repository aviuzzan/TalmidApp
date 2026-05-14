'use client'
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

/**
 * Infrastructure i18n légère pour TalmidApp.
 *
 * 3 langues : français (défaut), anglais, hébreu (RTL).
 *
 * Usage :
 *   - Wrapper l'app dans <I18nProvider> (déjà fait dans AppProviders)
 *   - Dans un composant : const { t, lang, setLang, dir } = useI18n()
 *   - t('cle.de.traduction') → string traduite
 *
 * La migration des strings est PROGRESSIVE : on ajoute les clés au dictionnaire
 * au fur et à mesure. Les composants non migrés restent en français en dur,
 * ce qui n'est pas bloquant.
 *
 * Le choix de langue est persisté dans localStorage.
 */

export type Lang = 'fr' | 'en' | 'he'

export const LANGS: { code: Lang; label: string; flag: string; dir: 'ltr' | 'rtl' }[] = [
  { code: 'fr', label: 'Français', flag: '🇫🇷', dir: 'ltr' },
  { code: 'en', label: 'English', flag: '🇬🇧', dir: 'ltr' },
  { code: 'he', label: 'עברית', flag: '🇮🇱', dir: 'rtl' },
]

// Dictionnaire de traductions. Structure plate "section.cle".
// On enrichit au fur et à mesure de la migration des écrans.
const TRANSLATIONS: Record<Lang, Record<string, string>> = {
  fr: {
    'common.save': 'Enregistrer',
    'common.cancel': 'Annuler',
    'common.delete': 'Supprimer',
    'common.edit': 'Modifier',
    'common.add': 'Ajouter',
    'common.loading': 'Chargement...',
    'common.search': 'Rechercher',
    'common.close': 'Fermer',
    'common.confirm': 'Confirmer',
    'common.back': 'Retour',
    'common.yes': 'Oui',
    'common.no': 'Non',
    'nav.dashboard': 'Tableau de bord',
    'nav.families': 'Familles',
    'nav.students': 'Élèves',
    'nav.finances': 'Finances',
    'nav.messaging': 'Messagerie',
    'nav.settings': 'Paramètres',
    'nav.logout': 'Se déconnecter',
    'portail.welcome': 'Bonjour',
    'portail.my_invoices': 'Mes factures',
    'portail.my_children': 'Mes enfants',
    'portail.documents': 'Documents',
    'login.title': 'Connexion',
    'login.email': 'Adresse e-mail',
    'login.password': 'Mot de passe',
    'login.submit': 'Se connecter',
  },
  en: {
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.add': 'Add',
    'common.loading': 'Loading...',
    'common.search': 'Search',
    'common.close': 'Close',
    'common.confirm': 'Confirm',
    'common.back': 'Back',
    'common.yes': 'Yes',
    'common.no': 'No',
    'nav.dashboard': 'Dashboard',
    'nav.families': 'Families',
    'nav.students': 'Students',
    'nav.finances': 'Finances',
    'nav.messaging': 'Messaging',
    'nav.settings': 'Settings',
    'nav.logout': 'Sign out',
    'portail.welcome': 'Hello',
    'portail.my_invoices': 'My invoices',
    'portail.my_children': 'My children',
    'portail.documents': 'Documents',
    'login.title': 'Sign in',
    'login.email': 'Email address',
    'login.password': 'Password',
    'login.submit': 'Sign in',
  },
  he: {
    'common.save': 'שמור',
    'common.cancel': 'ביטול',
    'common.delete': 'מחק',
    'common.edit': 'ערוך',
    'common.add': 'הוסף',
    'common.loading': 'טוען...',
    'common.search': 'חיפוש',
    'common.close': 'סגור',
    'common.confirm': 'אישור',
    'common.back': 'חזרה',
    'common.yes': 'כן',
    'common.no': 'לא',
    'nav.dashboard': 'לוח בקרה',
    'nav.families': 'משפחות',
    'nav.students': 'תלמידים',
    'nav.finances': 'כספים',
    'nav.messaging': 'הודעות',
    'nav.settings': 'הגדרות',
    'nav.logout': 'התנתק',
    'portail.welcome': 'שלום',
    'portail.my_invoices': 'החשבוניות שלי',
    'portail.my_children': 'הילדים שלי',
    'portail.documents': 'מסמכים',
    'login.title': 'התחברות',
    'login.email': 'כתובת אימייל',
    'login.password': 'סיסמה',
    'login.submit': 'התחבר',
  },
}

interface I18nContextValue {
  lang: Lang
  dir: 'ltr' | 'rtl'
  setLang: (l: Lang) => void
  t: (key: string, fallback?: string) => string
}

const I18nContext = createContext<I18nContextValue>({
  lang: 'fr',
  dir: 'ltr',
  setLang: () => {},
  t: (key, fallback) => fallback || key,
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('fr')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = localStorage.getItem('talmidapp_lang') as Lang | null
    if (stored && ['fr', 'en', 'he'].includes(stored)) {
      setLangState(stored)
    }
  }, [])

  const dir = LANGS.find(l => l.code === lang)?.dir || 'ltr'

  // Applique la direction au <html> pour le support RTL
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.dir = dir
    document.documentElement.lang = lang
  }, [dir, lang])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    if (typeof window !== 'undefined') localStorage.setItem('talmidapp_lang', l)
  }, [])

  const t = useCallback((key: string, fallback?: string): string => {
    return TRANSLATIONS[lang]?.[key] || TRANSLATIONS.fr[key] || fallback || key
  }, [lang])

  return (
    <I18nContext.Provider value={{ lang, dir, setLang, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext)
}
