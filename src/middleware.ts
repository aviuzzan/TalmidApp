import { NextRequest, NextResponse } from 'next/server'

/**
 * tttt1 (Yeter) — routage par domaine.
 * yeter.fr et www.yeter.fr affichent la vitrine Yeter sur la racine ;
 * TOUTES les autres routes (login, portail, admin, api) restent identiques
 * sur les deux domaines. Le matcher ne cible que '/' : zero impact ailleurs.
 */
export function middleware(req: NextRequest) {
  const host = (req.headers.get('host') || '').toLowerCase()
  if (host === 'yeter.fr' || host === 'www.yeter.fr') {
    const url = req.nextUrl.clone()
    url.pathname = '/yeter'
    return NextResponse.rewrite(url)
  }
  return NextResponse.next()
}

export const config = { matcher: ['/'] }
