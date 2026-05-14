'use client'
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

/**
 * Infrastructure i18n pour TalmidApp.
 * 3 langues : francais (defaut), anglais, hebreu (RTL).
 * Ecrans migres : accueil ecole, login, portail famille (nav + accueil).
 * L'admin reste en francais (personnel) - migration progressive possible.
 * Usage : const { t, lang, setLang, dir } = useI18n()
 * Choix de langue persiste dans localStorage.
 */

export type Lang = 'fr' | 'en' | 'he'

export const LANGS: { code: Lang; label: string; flag: string; dir: 'ltr' | 'rtl' }[] = [
  { code: 'fr', label: 'Francais', flag: 'FR', dir: 'ltr' },
  { code: 'en', label: 'English', flag: 'EN', dir: 'ltr' },
  { code: 'he', label: 'Hebrew', flag: 'HE', dir: 'rtl' },
]

const TRANSLATIONS: Record<Lang, Record<string, string>> = {
  fr: {
    'common.save': 'Enregistrer',
    'common.cancel': 'Annuler',
    'common.loading': 'Chargement...',
    'common.back': 'Retour',
    'accueil.welcome_on': 'Bienvenue sur',
    'accueil.desc': "Espace de gestion scolaire - administration, inscriptions, facturation et portail famille.",
    'accueil.login_button': 'Se connecter',
    'accueil.powered_by': 'Propulse par',
    'login.title': 'Connexion',
    'login.subtitle': 'Accedez a votre espace',
    'login.email': 'Adresse e-mail',
    'login.password': 'Mot de passe',
    'login.submit': 'Se connecter',
    'login.loading': 'Connexion...',
    'login.forgot': 'Mot de passe oublie ?',
    'login.error': 'E-mail ou mot de passe incorrect',
    'login.welcome': 'Bienvenue',
    'login.choose_space': 'Choisissez votre espace de connexion',
    'login.school_portal': 'Portail scolaire',
    'login.role_admin': 'Administration',
    'login.role_admin_desc': "Gestion de l'ecole",
    'login.role_teacher': 'Espace Professeur',
    'login.role_teacher_desc': 'Classes & eleves',
    'login.role_parent': 'Espace Parents',
    'login.role_parent_desc': 'Suivi de votre enfant',
    'login.desc_admin': "Accedez a l'espace d'administration",
    'login.desc_teacher': 'Accedez a vos classes et eleves',
    'login.desc_parent': 'Accedez au suivi scolaire de votre enfant',
    'login.no_admin_rights': "Ce compte n'a pas les droits administrateur.",
    'login.no_teacher_rights': "Ce compte n'a pas les droits professeur.",
    'login.no_parent_rights': "Ce compte n'a pas les droits parent.",
    'portail.nav.home': 'Accueil',
    'portail.nav.children': 'Mes enfants',
    'portail.nav.bulletins': 'Bulletins',
    'portail.nav.devoirs': 'Devoirs',
    'portail.nav.health': 'Sante',
    'portail.nav.invoices': 'Mes factures',
    'portail.nav.messaging': 'Messagerie',
    'portail.nav.next_year': 'Annee N+1',
    'portail.nav.documents': 'Documents',
    'portail.nav.account': 'Mon compte',
    'portail.nav.family_space': 'Espace Famille',
    'portail.logout': 'Deconnexion',
    'portail.welcome': 'Bonjour, famille',
    'portail.school_year': 'Annee scolaire',
    'portail.students_enrolled': 'Eleves inscrits',
    'portail.invoice': 'Facture',
    'portail.remaining_balance': 'Solde restant',
    'portail.no_family': "Votre compte n'est pas encore lie a une famille. Contactez l'administration.",
    'portail.welcome_title': 'Bienvenue sur TalmidApp',
  },
  en: {
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.loading': 'Loading...',
    'common.back': 'Back',
    'accueil.welcome_on': 'Welcome to',
    'accueil.desc': 'School management platform - administration, enrolment, billing and family portal.',
    'accueil.login_button': 'Sign in',
    'accueil.powered_by': 'Powered by',
    'login.title': 'Sign in',
    'login.subtitle': 'Access your space',
    'login.email': 'Email address',
    'login.password': 'Password',
    'login.submit': 'Sign in',
    'login.loading': 'Signing in...',
    'login.forgot': 'Forgot password?',
    'login.error': 'Incorrect email or password',
    'login.welcome': 'Welcome',
    'login.choose_space': 'Choose your login space',
    'login.school_portal': 'School portal',
    'login.role_admin': 'Administration',
    'login.role_admin_desc': 'School management',
    'login.role_teacher': 'Teacher space',
    'login.role_teacher_desc': 'Classes & students',
    'login.role_parent': 'Parents space',
    'login.role_parent_desc': 'Track your child',
    'login.desc_admin': 'Access the administration area',
    'login.desc_teacher': 'Access your classes and students',
    'login.desc_parent': "Access your child's school tracking",
    'login.no_admin_rights': 'This account does not have administrator rights.',
    'login.no_teacher_rights': 'This account does not have teacher rights.',
    'login.no_parent_rights': 'This account does not have parent rights.',
    'portail.nav.home': 'Home',
    'portail.nav.children': 'My children',
    'portail.nav.bulletins': 'Report cards',
    'portail.nav.devoirs': 'Homework',
    'portail.nav.health': 'Health',
    'portail.nav.invoices': 'My invoices',
    'portail.nav.messaging': 'Messages',
    'portail.nav.next_year': 'Next year',
    'portail.nav.documents': 'Documents',
    'portail.nav.account': 'My account',
    'portail.nav.family_space': 'Family space',
    'portail.logout': 'Sign out',
    'portail.welcome': 'Hello,',
    'portail.school_year': 'School year',
    'portail.students_enrolled': 'Enrolled students',
    'portail.invoice': 'Invoice',
    'portail.remaining_balance': 'Outstanding balance',
    'portail.no_family': 'Your account is not yet linked to a family. Please contact the administration.',
    'portail.welcome_title': 'Welcome to TalmidApp',
  },
  he: {
    'common.save': 'שמור',
    'common.cancel': 'ביטול',
    'common.loading': 'טוען...',
    'common.back': 'חזרה',
    'accueil.welcome_on': 'ברוכים הבאים אל',
    'accueil.desc': 'מערכת לניהול בית הספר - מנהלה, הרשמות, חיוב ופורטל משפחות.',
    'accueil.login_button': 'התחברות',
    'accueil.powered_by': 'מופעל על ידי',
    'login.title': 'התחברות',
    'login.subtitle': 'גישה למרחב שלך',
    'login.email': 'כתובת אימייל',
    'login.password': 'סיסמה',
    'login.submit': 'התחבר',
    'login.loading': 'מתחבר...',
    'login.forgot': 'שכחת סיסמה?',
    'login.error': 'אימייל או סיסמה שגויים',
    'login.welcome': 'ברוכים הבאים',
    'login.choose_space': 'בחר את מרחב ההתחברות שלך',
    'login.school_portal': 'פורטל בית ספרי',
    'login.role_admin': 'מנהלה',
    'login.role_admin_desc': 'ניהול בית הספר',
    'login.role_teacher': 'מרחב מורים',
    'login.role_teacher_desc': 'כיתות ותלמידים',
    'login.role_parent': 'מרחב הורים',
    'login.role_parent_desc': 'מעקב אחר ילדכם',
    'login.desc_admin': 'גישה למרחב הניהול',
    'login.desc_teacher': 'גישה לכיתות ולתלמידים שלך',
    'login.desc_parent': 'גישה למעקב הלימודי של ילדכם',
    'login.no_admin_rights': 'לחשבון זה אין הרשאות מנהל.',
    'login.no_teacher_rights': 'לחשבון זה אין הרשאות מורה.',
    'login.no_parent_rights': 'לחשבון זה אין הרשאות הורה.',
    'portail.nav.home': 'בית',
    'portail.nav.children': 'הילדים שלי',
    'portail.nav.bulletins': 'תעודות',
    'portail.nav.devoirs': 'שיעורי בית',
    'portail.nav.health': 'בריאות',
    'portail.nav.invoices': 'החשבוניות שלי',
    'portail.nav.messaging': 'הודעות',
    'portail.nav.next_year': 'שנה הבאה',
    'portail.nav.documents': 'מסמכים',
    'portail.nav.account': 'החשבון שלי',
    'portail.nav.family_space': 'מרחב המשפחה',
    'portail.logout': 'התנתק',
    'portail.welcome': 'שלום, משפחת',
    'portail.school_year': 'שנת לימודים',
    'portail.students_enrolled': 'תלמידים רשומים',
    'portail.invoice': 'חשבונית',
    'portail.remaining_balance': 'יתרה לתשלום',
    'portail.no_family': 'החשבון שלך עדיין לא מקושר למשפחה. אנא פנה למנהלה.',
    'portail.welcome_title': 'ברוכים הבאים ל-TalmidApp',
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
