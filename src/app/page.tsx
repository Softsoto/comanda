import Link from "next/link";
import { SiteFooter, Wordmark } from "@/components/ui/SiteChrome";
import { getSessionUser } from "@/lib/auth";
import { APP_NAME, DEMO_SLUG } from "@/lib/config";
import { getBusinessBySlug } from "@/lib/data";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    title: "Crea tu menú",
    text: "Regístrate, escribe el nombre de tu negocio y tu número de WhatsApp. Luego agrega categorías y productos con foto y precio.",
  },
  {
    title: "Comparte el enlace o el código QR",
    text: "Cada negocio recibe un enlace propio. Pégalo en Instagram, envíalo por WhatsApp o imprime el QR para las mesas.",
  },
  {
    title: "Recibe los pedidos en WhatsApp",
    text: "El cliente arma su pedido, escribe sus datos y toca enviar. A ti te llega el mensaje listo para preparar, y el pedido queda guardado en tu panel con su número.",
  },
];

const FEATURES = [
  {
    title: "Pedidos con número y aviso con sonido",
    text: "Cada pedido queda guardado y tu panel suena cuando entra uno. Lo marcas en preparación, en camino o completado, y lo imprimes como comanda.",
  },
  {
    title: "Tamaños y adicionales",
    text: "Cada producto puede tener opciones: tamaño, término, adiciones. El precio se ajusta solo según lo que elige el cliente.",
  },
  {
    title: "Domicilio por zonas y cupones",
    text: "Cobra el domicilio según el barrio, regálalo desde cierto valor y crea códigos de descuento.",
  },
  {
    title: "El cliente sigue su pedido",
    text: "Con cada pedido recibe un enlace para ver cómo va: recibido, en preparación, en camino.",
  },
  {
    title: "Ventas, ganancias y clientes",
    text: "Reportes por fechas, tus clientes frecuentes y todo descargable en Excel, con el inventario de productos.",
  },
  {
    title: "Abierto, cerrado u horarios",
    text: "Abre o cierra tu tienda con un toque, o programa tus horarios para que lo haga sola.",
  },
  {
    title: "Promociones a la vista",
    text: "Sube imágenes de promociones y anuncios; se muestran en un carrusel encima de tu menú.",
  },
];

export default async function HomePage() {
  const [user, demo] = await Promise.all([getSessionUser(), getBusinessBySlug(DEMO_SLUG)]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-3">
        <Wordmark />
        {user ? (
          <Link href="/panel" className="btn btn-secondary">
            Ir a mi panel
          </Link>
        ) : (
          <Link href="/entrar" className="btn btn-ghost">
            Entrar
          </Link>
        )}
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4">
        <section className="py-10 sm:py-16">
          <h1 className="max-w-2xl font-display text-[2.5rem] leading-[1.05] font-bold sm:text-6xl">
            Tu menú digital. El pedido llega por WhatsApp.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            {APP_NAME} le da a tu negocio un menú con fotos y precios que se abre desde el celular. Tus clientes eligen,
            escriben su dirección y te envían el pedido completo a tu WhatsApp.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={user ? "/panel" : "/registro"} className="btn btn-primary min-h-12 px-6">
              {user ? "Ir a mi panel" : "Crear mi menú"}
            </Link>
            {demo && (
              <Link href={`/m/${DEMO_SLUG}`} className="btn btn-secondary min-h-12 px-6">
                Ver un menú de ejemplo
              </Link>
            )}
          </div>
        </section>

        <section aria-labelledby="como-funciona" className="pb-12">
          <h2 id="como-funciona" className="font-display text-title font-bold">
            Cómo funciona
          </h2>
          <ol className="mt-4 grid gap-3 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="card">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-tint font-display font-bold tabular-nums">
                  {index + 1}
                </span>
                <h3 className="mt-3 font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="incluye" className="pb-14">
          <h2 id="incluye" className="font-display text-title font-bold">
            También incluye
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="card">
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="mt-1 text-sm text-muted">{feature.text}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
