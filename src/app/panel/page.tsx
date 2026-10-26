import Link from "next/link";
import QRCode from "qrcode";
import { CopyButton } from "@/components/ui/CopyButton";
import { CheckIcon, ExternalIcon } from "@/components/ui/icons";
import { APP_NAME } from "@/lib/config";
import { listCoupons } from "@/lib/coupons-data";
import { countMenu, getBanners, getZones } from "@/lib/data";
import { dayStart, todayKey, addDays } from "@/lib/dates";
import { hasAnyHours } from "@/lib/hours";
import { formatMoney } from "@/lib/money";
import { summarizeByStatus } from "@/lib/orders-data";
import { getBaseUrl, isLocalhostUrl, requireBusiness } from "@/lib/panel";
import { formatWhatsapp } from "@/lib/phone";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export default async function PanelHomePage() {
  const { business } = await requireBusiness();
  const today = todayKey(business.timezone);
  const [counts, baseUrl, todaySummary, pending, banners, zoneList, couponList] = await Promise.all([
    countMenu(business.id),
    getBaseUrl(),
    summarizeByStatus(business.id, {
      start: dayStart(today, business.timezone),
      end: dayStart(addDays(today, 1), business.timezone),
    }),
    // Sin fechas: todos los pedidos que siguen sin atender, también los de días anteriores.
    summarizeByStatus(business.id, {}),
    getBanners(business.id),
    getZones(business.id),
    listCoupons(business.id),
  ]);
  const zones = zoneList.length;
  const coupons = couponList.length;
  const todayOrders = Object.values(todaySummary).reduce((sum, item) => sum + item.count, 0);
  const waiting = pending.nuevo.count;
  const inProgress = pending.preparando.count + pending.listo.count;
  const menuUrl = `${baseUrl}/m/${business.slug}`;
  const qrDataUrl = await QRCode.toDataURL(menuUrl, {
    width: 640,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#1c1a17", light: "#ffffff" },
  });

  const tasks: { done: boolean; title: string; detail: string; href: string; action: string; testUrl?: string }[] = [
    {
      done: business.whatsapp !== "",
      title: "Número de WhatsApp",
      detail: business.whatsapp
        ? `Los pedidos llegan a ${formatWhatsapp(business.whatsapp)}.`
        : "Falta el número. Sin él, el cliente tendrá que elegir a quién enviar el pedido.",
      href: "/panel/perfil",
      action: business.whatsapp ? "Cambiar" : "Agregar número",
      // Abre un chat con ese número para comprobar que es el correcto.
      testUrl: business.whatsapp
        ? buildWhatsAppUrl(business.whatsapp, `Prueba de ${APP_NAME}: este es el WhatsApp de ${business.name}.`)
        : undefined,
    },
    {
      done: counts.categories > 0,
      title: "Categorías",
      detail:
        counts.categories > 0
          ? `Tienes ${counts.categories} ${counts.categories === 1 ? "categoría" : "categorías"}.`
          : "Crea la primera, por ejemplo “Hamburguesas” o “Bebidas”.",
      href: "/panel/menu",
      action: counts.categories > 0 ? "Ver" : "Crear categoría",
    },
    {
      done: counts.products > 0,
      title: "Productos",
      detail:
        counts.products > 0
          ? `Tienes ${counts.products} ${counts.products === 1 ? "producto" : "productos"} en el menú.`
          : "Agrega productos con foto, descripción y precio.",
      href: "/panel/menu",
      action: counts.products > 0 ? "Ver" : "Agregar productos",
    },
  ];

  const usesHours = business.openMode === "horario" && hasAnyHours(business.schedule);
  const extras: { title: string; detail: string; href: string; action: string }[] = [
    {
      title: "Horario de atención",
      detail: usesHours
        ? "Tu tienda abre y cierra sola según tu horario."
        : "Define tus horas para que la tienda abra y cierre sola, y tus clientes vean el horario.",
      href: "/panel/horarios",
      action: usesHours ? "Cambiar" : "Definir horario",
    },
    {
      title: "Publicidad",
      detail:
        banners.length > 0
          ? `Tienes ${banners.length} ${banners.length === 1 ? "imagen" : "imágenes"} de promociones en tu menú.`
          : "Sube imágenes de promociones y anuncios para mostrarlas encima de tu menú.",
      href: "/panel/publicidad",
      action: banners.length > 0 ? "Cambiar" : "Subir imágenes",
    },
    {
      title: "Tamaños, adicionales, costos y existencias",
      detail: "Al editar un producto puedes darle opciones (tamaño, adiciones), su costo para ver tu ganancia y sus unidades para que lo agotado se marque solo.",
      href: "/panel/menu",
      action: "Ir al menú",
    },
    {
      title: "Domicilio por zonas",
      detail:
        zones > 0
          ? `Tienes ${zones} ${zones === 1 ? "zona" : "zonas"} de domicilio con su precio.`
          : "Cobra el domicilio según el barrio y regálalo desde cierto valor de compra.",
      href: "/panel/entregas",
      action: zones > 0 ? "Cambiar" : "Crear zonas",
    },
    {
      title: "Cupones de descuento",
      detail:
        coupons > 0
          ? `Tienes ${coupons} ${coupons === 1 ? "cupón" : "cupones"}.`
          : "Crea códigos de descuento para tus clientes.",
      href: "/panel/cupones",
      action: coupons > 0 ? "Ver" : "Crear cupón",
    },
    {
      title: "Aviso con sonido",
      detail: "Haz que este dispositivo suene cuando entre un pedido. Se activa en la página de pedidos.",
      href: "/panel/pedidos",
      action: "Ir a pedidos",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-display font-bold wrap-anywhere">{business.name}</h1>
        <p className="mt-1 text-muted">Desde aquí ves tus pedidos, compartes tu menú y revisas que todo esté listo.</p>
      </div>

      <section className="card" aria-labelledby="hoy">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="hoy" className="font-display text-title font-bold">
            Pedidos
          </h2>
          <Link href="/panel/pedidos" className={`btn btn-sm ${waiting > 0 ? "btn-primary" : "btn-secondary"}`}>
            {waiting > 0 ? `Atender ${waiting === 1 ? "1 pedido nuevo" : `${waiting} pedidos nuevos`}` : "Ver pedidos"}
          </Link>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <div>
            <dt className="text-sm text-muted">Sin atender</dt>
            <dd className="text-[1.625rem] leading-8 font-semibold">{waiting}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">En curso</dt>
            <dd className="text-[1.625rem] leading-8 font-semibold">{inProgress}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Recibidos hoy</dt>
            <dd className="text-[1.625rem] leading-8 font-semibold">{todayOrders}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Ventas de hoy</dt>
            <dd className="text-[1.625rem] leading-8 font-semibold wrap-anywhere">
              {formatMoney(todaySummary.completado.totalCents, business.currency)}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-caption text-muted">Las ventas cuentan los pedidos que marcaste como completados.</p>
      </section>

      <section className="card" aria-labelledby="compartir">
        <h2 id="compartir" className="font-display text-title font-bold">
          Comparte tu menú
        </h2>
        <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex shrink-0 flex-col items-center gap-3">
            <img
              src={qrDataUrl}
              alt={`Código QR del menú de ${business.name}`}
              width={176}
              height={176}
              className="h-44 w-44 rounded-field border border-line/40 bg-white"
            />
            <a href={qrDataUrl} download={`qr-menu-${business.slug}.png`} className="btn btn-secondary btn-sm">
              Descargar QR
            </a>
          </div>
          <div className="min-w-0 flex-1">
            <p className="label">Enlace de tu menú</p>
            <p className="rounded-field border border-line/50 bg-surface px-3 py-2.5 font-semibold break-all select-all">
              {menuUrl}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <CopyButton text={menuUrl} />
              <Link href={`/m/${business.slug}`} target="_blank" className="btn btn-primary">
                Abrir mi menú
                <ExternalIcon width={18} height={18} />
              </Link>
            </div>
            <p className="hint mt-3">
              Pega el enlace en tu perfil de Instagram o envíalo por WhatsApp. El código QR sirve para imprimirlo en
              mesas, volantes o empaques.
            </p>
            {isLocalhostUrl(baseUrl) && (
              <p className="mt-3 rounded-field bg-brand-tint px-3 py-2.5 text-sm">
                <span className="font-semibold">Estás probando en este computador.</span> Este enlace solo abre aquí.
                Para probar desde el celular, conéctalo a la misma red wifi y abre la dirección de red que muestra la
                ventana de inicio (algo como http://192.168.1.20:3000).
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="card" aria-labelledby="pasos">
        <h2 id="pasos" className="font-display text-title font-bold">
          Lo que necesita tu menú
        </h2>
        <ul className="mt-2 divide-y divide-line/25">
          {tasks.map((task) => (
            <li key={task.title} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                  task.done ? "bg-brand-tint text-brand" : "border border-dashed border-line text-muted"
                }`}
              >
                {task.done ? <CheckIcon width={18} height={18} /> : null}
                <span className="sr-only">{task.done ? "Listo:" : "Pendiente:"}</span>
              </span>
              <div className="min-w-0 flex-1 basis-48">
                <p className="font-semibold">{task.title}</p>
                <p className="text-sm text-muted">{task.detail}</p>
              </div>
              {task.testUrl && (
                <a href={task.testUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                  Probar
                </a>
              )}
              <Link href={task.href} className={`btn btn-sm ${task.done ? "btn-secondary" : "btn-outline-brand"}`}>
                {task.action}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="card" aria-labelledby="opcional">
        <h2 id="opcional" className="font-display text-title font-bold">
          Opcional
        </h2>
        <ul className="mt-2 divide-y divide-line/25">
          {extras.map((extra) => (
            <li key={extra.title} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
              <div className="min-w-0 flex-1 basis-48">
                <p className="font-semibold">{extra.title}</p>
                <p className="text-sm text-muted">{extra.detail}</p>
              </div>
              <Link href={extra.href} className="btn btn-secondary btn-sm">
                {extra.action}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
