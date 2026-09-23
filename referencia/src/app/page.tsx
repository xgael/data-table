import { leerVista } from '@/lib/url'
import { Facturas } from './Facturas'

// El estado inicial sale de la URL en el servidor: al recargar o compartir el
// enlace, la tabla aparece ya filtrada, sin parpadeo.
export default async function Page({ searchParams }: PageProps<'/'>) {
  return <Facturas inicial={leerVista(await searchParams)} />
}
