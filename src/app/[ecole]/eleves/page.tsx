// eeee1 (audit module 4, P2-7) : /eleves affichait « Bientot disponible » alors
// que la page existe sous /enfants (le menu pointe sur enfants). Redirection.
import { redirect } from 'next/navigation'
export default function Page({ params }: { params: { ecole: string } }) {
  redirect(`/${params.ecole}/enfants`)
}
