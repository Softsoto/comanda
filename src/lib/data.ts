import "server-only";

import { cache } from "react";
import { isBannerSlot, type BannerSlot } from "./banners";
import { DEMO_EMAIL } from "./config";
import { DEFAULT_TIMEZONE, addDays, todayKey } from "./dates";
import { isLocalDatabase, localDataDir, query, queryOne, transaction, type QueryFn } from "./db";
import { removeDemoPasswordFile } from "./demo-account";
import { isOpenMode, parseSchedule, serializeSchedule, type OpenMode, type WeeklySchedule } from "./hours";
import { parseOptions, serializeOptions, type OptionGroup } from "./options";
import { parseDeliveryModes, type DeliveryMode } from "./orders";
import { settingsFromRows } from "./settings";
import { slugify } from "./slug";

/**
 * Acceso a datos. Todas las funciones que modifican algo reciben el id del
 * negocio y lo incluyen en el WHERE: así un negocio nunca puede tocar los
 * productos de otro, aunque alguien envíe un id ajeno.
 */

export type Business = {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  whatsapp: string;
  currency: string;
  paymentMethods: string[];
  logoImageId: string | null;
  /** Zona horaria con la que se muestran fechas y se filtran reportes. */
  timezone: string;
  /** Suspendido por el administrador del servicio: su menú deja de mostrarse. */
  isSuspended: boolean;
  deliveryModes: DeliveryMode[];
  /** Costo fijo de domicilio; 0 = se acuerda con el cliente por WhatsApp. */
  deliveryFeeCents: number;
  /** Pedido mínimo; 0 = sin mínimo. */
  minOrderCents: number;
  /** abierto | cerrado | horario (abre y cierra sola según el horario). */
  openMode: OpenMode;
  /** Horario semanal; solo manda cuando openMode es "horario". */
  schedule: WeeklySchedule;
  /** Domicilio gratis desde este valor en productos; 0 = no aplica. */
  freeDeliveryFromCents: number;
  /** Plan del servicio que tiene contratado (si el dueño del servicio usa planes). */
  planId: string | null;
  /** Último día pagado ("AAAA-MM-DD"); null = no vence. */
  paidUntil: string | null;
};

export type Category = { id: string; name: string; position: number };

export type Product = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  priceCents: number;
  imageId: string | null;
  isAvailable: boolean;
  /** Lo que le cuesta al negocio (opcional). Nunca se envía al menú público. */
  costCents: number | null;
  /** Existencias (opcional). null = no se controlan. */
  stock: number | null;
  /** Grupos de opciones: tamaños, adicionales… */
  options: OptionGroup[];
};

export type MenuCategory = Category & { products: Product[] };

type BusinessRow = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  whatsapp: string;
  currency: string;
  payment_methods: string;
  logo_image_id: string | null;
  timezone: string;
  is_suspended: boolean;
  delivery_modes: string;
  delivery_fee_cents: number;
  min_order_cents: number;
  open_mode: string;
  schedule: string;
  free_delivery_from_cents: number;
  plan_id: string | null;
  paid_until: string | null;
};

type ProductRow = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price_cents: number;
  image_id: string | null;
  is_available: boolean;
  cost_cents: number | null;
  stock: number | null;
  options: string;
};

const BUSINESS_COLUMNS =
  "id, owner_id, name, slug, whatsapp, currency, payment_methods, logo_image_id, timezone, is_suspended, delivery_modes, delivery_fee_cents, min_order_cents, open_mode, schedule, free_delivery_from_cents, plan_id, paid_until::text as paid_until";
const PRODUCT_COLUMNS =
  "id, category_id, name, description, price_cents, image_id, is_available, cost_cents, stock, options";

const toBusiness = (row: BusinessRow): Business => ({
  id: row.id,
  ownerId: row.owner_id,
  name: row.name,
  slug: row.slug,
  whatsapp: row.whatsapp,
  currency: row.currency,
  paymentMethods: row.payment_methods
    .split("\n")
    .map((method) => method.trim())
    .filter(Boolean),
  logoImageId: row.logo_image_id,
  timezone: row.timezone,
  isSuspended: row.is_suspended,
  deliveryModes: parseDeliveryModes(row.delivery_modes),
  deliveryFeeCents: Number(row.delivery_fee_cents),
  minOrderCents: Number(row.min_order_cents),
  openMode: isOpenMode(row.open_mode) ? row.open_mode : "abierto",
  schedule: parseSchedule(row.schedule),
  freeDeliveryFromCents: Number(row.free_delivery_from_cents),
  planId: row.plan_id,
  paidUntil: row.paid_until,
});

const toProduct = (row: ProductRow): Product => ({
  id: row.id,
  categoryId: row.category_id,
  name: row.name,
  description: row.description,
  priceCents: Number(row.price_cents),
  imageId: row.image_id,
  isAvailable: row.is_available,
  costCents: row.cost_cents === null ? null : Number(row.cost_cents),
  stock: row.stock === null ? null : Number(row.stock),
  options: parseOptions(row.options),
});

export const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";

/* ---------- Usuarios y negocios ---------- */

export async function findUserByEmail(email: string) {
  return queryOne<{ id: string; email: string; password_hash: string }>(
    "select id, email, password_hash from users where email = $1",
    [email],
  );
}

async function availableSlug(q: QueryFn, base: string, exceptBusinessId?: string): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
    const candidate = base.slice(0, 40 - suffix.length).replace(/-+$/g, "") + suffix;
    const taken = await q<{ id: string }>("select id from businesses where slug = $1", [candidate]);
    if (taken.length === 0 || taken[0].id === exceptBusinessId) return candidate;
  }
  return `${base.slice(0, 30)}-${Date.now().toString(36)}`;
}

/** Crea la cuenta y su negocio en una sola operación. Devuelve el id del usuario. */
export async function createAccount(input: {
  email: string;
  passwordHash: string;
  businessName: string;
  whatsapp: string;
  currency: string;
  paymentMethods: string[];
}): Promise<string> {
  return transaction(async (q) => {
    const [user] = await q<{ id: string }>(
      "insert into users (email, password_hash) values ($1, $2) returning id",
      [input.email, input.passwordHash],
    );
    const slug = await availableSlug(q, slugify(input.businessName));

    // Si el servicio tiene un plan para comercios nuevos, la cuenta empieza con
    // él y con los días de prueba que diga el administrador.
    const [plan] = await q<{ id: string }>("select id from plans where is_default order by position, created_at limit 1");
    let paidUntil: string | null = null;
    if (plan) {
      const settings = settingsFromRows(await q<{ key: string; value: string }>("select key, value from settings"));
      if (settings.trialDays > 0) paidUntil = addDays(todayKey(DEFAULT_TIMEZONE), settings.trialDays);
    }

    await q(
      `insert into businesses (owner_id, name, slug, whatsapp, currency, payment_methods, plan_id, paid_until)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        user.id,
        input.businessName,
        slug,
        input.whatsapp,
        input.currency,
        input.paymentMethods.join("\n"),
        plan?.id ?? null,
        paidUntil,
      ],
    );
    return user.id;
  });
}

export const getBusinessByOwner = cache(async (ownerId: string): Promise<Business | null> => {
  const row = await queryOne<BusinessRow>(`select ${BUSINESS_COLUMNS} from businesses where owner_id = $1`, [ownerId]);
  return row ? toBusiness(row) : null;
});

/** Devuelve el negocio de la cuenta; si por algún motivo no existe, crea uno vacío. */
export async function ensureBusiness(ownerId: string): Promise<Business> {
  const existing = await getBusinessByOwner(ownerId);
  if (existing) return existing;
  const slug = await availableSlug(query, "mi-negocio");
  const row = await queryOne<BusinessRow>(
    `insert into businesses (owner_id, name, slug) values ($1, 'Mi negocio', $2)
     on conflict (owner_id) do update set name = businesses.name
     returning ${BUSINESS_COLUMNS}`,
    [ownerId, slug],
  );
  return toBusiness(row as BusinessRow);
}

export const getBusinessBySlug = cache(async (slug: string): Promise<Business | null> => {
  const row = await queryOne<BusinessRow>(`select ${BUSINESS_COLUMNS} from businesses where slug = $1`, [slug]);
  return row ? toBusiness(row) : null;
});

/** Para la administración del servicio: un negocio cualquiera por su id. */
export async function getBusinessById(businessId: string): Promise<Business | null> {
  const row = await queryOne<BusinessRow>(`select ${BUSINESS_COLUMNS} from businesses where id = $1`, [businessId]);
  return row ? toBusiness(row) : null;
}

export async function isSlugTaken(slug: string, exceptBusinessId: string): Promise<boolean> {
  const row = await queryOne("select 1 as taken from businesses where slug = $1 and id <> $2", [slug, exceptBusinessId]);
  return row !== null;
}

export async function updateBusiness(
  businessId: string,
  input: { name: string; slug: string; whatsapp: string; currency: string; paymentMethods: string[]; timezone: string },
): Promise<void> {
  await query(
    `update businesses
        set name = $2, slug = $3, whatsapp = $4, currency = $5, payment_methods = $6, timezone = $7
      where id = $1`,
    [businessId, input.name, input.slug, input.whatsapp, input.currency, input.paymentMethods.join("\n"), input.timezone],
  );
}

/** Ajustes de entrega: formas, costo fijo de domicilio, pedido mínimo y domicilio gratis desde un valor. */
export async function updateDelivery(
  businessId: string,
  input: { deliveryModes: DeliveryMode[]; deliveryFeeCents: number; minOrderCents: number; freeDeliveryFromCents: number },
): Promise<void> {
  await query(
    `update businesses
        set delivery_modes = $2, delivery_fee_cents = $3, min_order_cents = $4, free_delivery_from_cents = $5
      where id = $1`,
    [businessId, input.deliveryModes.join(","), input.deliveryFeeCents, input.minOrderCents, input.freeDeliveryFromCents],
  );
}

export async function setOpenMode(businessId: string, mode: OpenMode): Promise<void> {
  await query("update businesses set open_mode = $2 where id = $1", [businessId, mode]);
}

export async function setSchedule(businessId: string, schedule: WeeklySchedule): Promise<void> {
  await query("update businesses set schedule = $2 where id = $1", [businessId, serializeSchedule(schedule)]);
}

export async function getPasswordHash(userId: string): Promise<string | null> {
  const row = await queryOne<{ password_hash: string }>("select password_hash from users where id = $1", [userId]);
  return row?.password_hash ?? null;
}

/** Cambia la contraseña y cierra las demás sesiones de esa cuenta. */
export async function setPassword(userId: string, passwordHash: string, keepTokenHash?: string): Promise<void> {
  const email = await transaction(async (q) => {
    const rows = await q<{ email: string }>("update users set password_hash = $2 where id = $1 returning email", [
      userId,
      passwordHash,
    ]);
    if (keepTokenHash) {
      await q("delete from sessions where user_id = $1 and token_hash <> $2", [userId, keepTokenHash]);
    } else {
      await q("delete from sessions where user_id = $1", [userId]);
    }
    return rows[0]?.email;
  });
  forgetDemoPasswordFile(email);
}

/**
 * Si la cuenta que cambió de contraseña es la de ejemplo, la que estaba
 * escrita en la carpeta de datos ya no sirve: se borra ese archivo.
 */
export function forgetDemoPasswordFile(email: string | undefined): void {
  if (email === DEMO_EMAIL && isLocalDatabase()) removeDemoPasswordFile(localDataDir());
}

/* ---------- Imágenes ---------- */

export async function insertImage(businessId: string, mime: string, bytes: Uint8Array): Promise<string> {
  const [row] = await query<{ id: string }>(
    "insert into images (business_id, mime, bytes) values ($1, $2, $3) returning id",
    [businessId, mime, bytes],
  );
  return row.id;
}

export async function deleteImage(businessId: string, imageId: string | null): Promise<void> {
  if (!imageId) return;
  await query("delete from images where id = $1 and business_id = $2", [imageId, businessId]);
}

export async function getImage(imageId: string): Promise<{ mime: string; bytes: Uint8Array } | null> {
  return queryOne<{ mime: string; bytes: Uint8Array }>("select mime, bytes from images where id = $1", [imageId]);
}

export async function setBusinessLogo(businessId: string, imageId: string | null): Promise<void> {
  await query("update businesses set logo_image_id = $2 where id = $1", [businessId, imageId]);
}

/* ---------- Menú ---------- */

export async function getMenu(businessId: string): Promise<MenuCategory[]> {
  const [categories, products] = await Promise.all([
    query<{ id: string; name: string; position: number }>(
      "select id, name, position from categories where business_id = $1 order by position, created_at",
      [businessId],
    ),
    query<ProductRow>(
      `select ${PRODUCT_COLUMNS} from products where business_id = $1 order by position, created_at`,
      [businessId],
    ),
  ]);
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    position: Number(category.position),
    products: products.filter((product) => product.category_id === category.id).map(toProduct),
  }));
}

export async function getCategories(businessId: string): Promise<Category[]> {
  const rows = await query<{ id: string; name: string; position: number }>(
    "select id, name, position from categories where business_id = $1 order by position, created_at",
    [businessId],
  );
  return rows.map((row) => ({ id: row.id, name: row.name, position: Number(row.position) }));
}

export async function createCategory(businessId: string, name: string): Promise<string> {
  const [row] = await query<{ id: string }>(
    `insert into categories (business_id, name, position)
     values ($1, $2, (select coalesce(max(position), -1) + 1 from categories where business_id = $1))
     returning id`,
    [businessId, name],
  );
  return row.id;
}

export async function renameCategory(businessId: string, categoryId: string, name: string): Promise<void> {
  await query("update categories set name = $3 where id = $2 and business_id = $1", [businessId, categoryId, name]);
}

/** Borra la categoría con sus productos y las fotos de esos productos. */
export async function deleteCategory(businessId: string, categoryId: string): Promise<void> {
  await transaction(async (q) => {
    await q(
      `delete from images where business_id = $1 and id in
         (select image_id from products where business_id = $1 and category_id = $2 and image_id is not null)`,
      [businessId, categoryId],
    );
    await q("delete from categories where id = $2 and business_id = $1", [businessId, categoryId]);
  });
}

export async function getProduct(businessId: string, productId: string): Promise<Product | null> {
  const row = await queryOne<ProductRow>(
    `select ${PRODUCT_COLUMNS} from products where id = $2 and business_id = $1`,
    [businessId, productId],
  );
  return row ? toProduct(row) : null;
}

export async function categoryBelongsTo(businessId: string, categoryId: string): Promise<boolean> {
  const row = await queryOne("select 1 as ok from categories where id = $2 and business_id = $1", [
    businessId,
    categoryId,
  ]);
  return row !== null;
}

export type ProductInput = {
  categoryId: string;
  name: string;
  description: string;
  priceCents: number;
  isAvailable: boolean;
  costCents: number | null;
  stock: number | null;
  options: OptionGroup[];
};

export async function createProduct(businessId: string, input: ProductInput, imageId: string | null): Promise<string> {
  const [row] = await query<{ id: string }>(
    `insert into products
       (business_id, category_id, name, description, price_cents, is_available, image_id, cost_cents, stock, options, position)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       (select coalesce(max(position), -1) + 1 from products where business_id = $1 and category_id = $2))
     returning id`,
    [
      businessId,
      input.categoryId,
      input.name,
      input.description,
      input.priceCents,
      input.isAvailable,
      imageId,
      input.costCents,
      input.stock,
      serializeOptions(input.options),
    ],
  );
  return row.id;
}

export async function updateProduct(businessId: string, productId: string, input: ProductInput): Promise<void> {
  await query(
    `update products
        set category_id = $3, name = $4, description = $5, price_cents = $6, is_available = $7,
            cost_cents = $8, stock = $9, options = $10
      where id = $2 and business_id = $1`,
    [
      businessId,
      productId,
      input.categoryId,
      input.name,
      input.description,
      input.priceCents,
      input.isAvailable,
      input.costCents,
      input.stock,
      serializeOptions(input.options),
    ],
  );
}

export async function setProductImage(businessId: string, productId: string, imageId: string | null): Promise<void> {
  await query("update products set image_id = $3 where id = $2 and business_id = $1", [businessId, productId, imageId]);
}

export async function setProductAvailability(businessId: string, productId: string, isAvailable: boolean): Promise<void> {
  await query("update products set is_available = $3 where id = $2 and business_id = $1", [
    businessId,
    productId,
    isAvailable,
  ]);
}

export async function deleteProduct(businessId: string, productId: string): Promise<void> {
  await transaction(async (q) => {
    const rows = await q<{ image_id: string | null }>(
      "delete from products where id = $2 and business_id = $1 returning image_id",
      [businessId, productId],
    );
    const imageId = rows[0]?.image_id;
    if (imageId) await q("delete from images where id = $1 and business_id = $2", [imageId, businessId]);
  });
}

/** Sube o baja un puesto una categoría, un producto o una imagen de publicidad dentro de su lista. */
export async function moveItem(
  businessId: string,
  kind: "category" | "product" | "banner" | "zone",
  id: string,
  direction: "up" | "down",
): Promise<void> {
  await transaction(async (q) => {
    let siblings: { id: string }[];
    if (kind === "category") {
      siblings = await q<{ id: string }>(
        "select id from categories where business_id = $1 order by position, created_at",
        [businessId],
      );
    } else if (kind === "zone") {
      siblings = await q<{ id: string }>(
        "select id from delivery_zones where business_id = $1 order by position, created_at",
        [businessId],
      );
    } else if (kind === "banner") {
      siblings = await q<{ id: string }>(
        `select id from banners
          where business_id = $1
            and slot = (select slot from banners where id = $2 and business_id = $1)
          order by position, created_at`,
        [businessId, id],
      );
    } else {
      siblings = await q<{ id: string }>(
        `select id from products
          where business_id = $1
            and category_id = (select category_id from products where id = $2 and business_id = $1)
          order by position, created_at`,
        [businessId, id],
      );
    }
    const ids = siblings.map((row) => row.id);
    const index = ids.indexOf(id);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    const table = { category: "categories", product: "products", banner: "banners", zone: "delivery_zones" }[kind];
    for (let position = 0; position < ids.length; position++) {
      await q(`update ${table} set position = $3 where id = $2 and business_id = $1`, [businessId, ids[position], position]);
    }
  });
}

export async function countMenu(businessId: string): Promise<{ categories: number; products: number }> {
  const row = await queryOne<{ categories: number; products: number }>(
    `select (select count(*)::int from categories where business_id = $1) as categories,
            (select count(*)::int from products where business_id = $1) as products`,
    [businessId],
  );
  return { categories: Number(row?.categories ?? 0), products: Number(row?.products ?? 0) };
}

/* ---------- Publicidad ---------- */

export type Banner = { id: string; slot: BannerSlot; imageId: string; title: string };

/** Imágenes de publicidad de un negocio, en el orden en que se muestran. */
export async function getBanners(businessId: string): Promise<Banner[]> {
  const rows = await query<{ id: string; slot: string; image_id: string; title: string }>(
    "select id, slot, image_id, title from banners where business_id = $1 order by position, created_at",
    [businessId],
  );
  return rows.flatMap((row) =>
    isBannerSlot(row.slot) ? [{ id: row.id, slot: row.slot, imageId: row.image_id, title: row.title }] : [],
  );
}

export async function addBanner(businessId: string, slot: BannerSlot, imageId: string, title: string): Promise<void> {
  await query(
    `insert into banners (business_id, slot, image_id, title, position)
     values ($1, $2, $3, $4,
       (select coalesce(max(position), -1) + 1 from banners where business_id = $1 and slot = $2))`,
    [businessId, slot, imageId, title],
  );
}

/** Quita una imagen de publicidad y borra su archivo. */
export async function deleteBanner(businessId: string, bannerId: string): Promise<void> {
  await transaction(async (q) => {
    const rows = await q<{ image_id: string }>(
      "delete from banners where id = $2 and business_id = $1 returning image_id",
      [businessId, bannerId],
    );
    const imageId = rows[0]?.image_id;
    if (imageId) await q("delete from images where id = $1 and business_id = $2", [imageId, businessId]);
  });
}

/* ---------- Zonas de domicilio ---------- */

export type DeliveryZone = { id: string; name: string; feeCents: number };

/** Zonas o barrios a los que el negocio lleva domicilios, cada una con su precio. */
export async function getZones(businessId: string): Promise<DeliveryZone[]> {
  const rows = await query<{ id: string; name: string; fee_cents: number }>(
    "select id, name, fee_cents from delivery_zones where business_id = $1 order by position, created_at",
    [businessId],
  );
  return rows.map((row) => ({ id: row.id, name: row.name, feeCents: Number(row.fee_cents) }));
}

export async function addZone(businessId: string, name: string, feeCents: number): Promise<void> {
  await query(
    `insert into delivery_zones (business_id, name, fee_cents, position)
     values ($1, $2, $3, (select coalesce(max(position), -1) + 1 from delivery_zones where business_id = $1))`,
    [businessId, name, feeCents],
  );
}

export async function updateZone(businessId: string, zoneId: string, name: string, feeCents: number): Promise<void> {
  await query("update delivery_zones set name = $3, fee_cents = $4 where id = $2 and business_id = $1", [
    businessId,
    zoneId,
    name,
    feeCents,
  ]);
}

export async function deleteZone(businessId: string, zoneId: string): Promise<void> {
  await query("delete from delivery_zones where id = $2 and business_id = $1", [businessId, zoneId]);
}
