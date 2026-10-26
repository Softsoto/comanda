import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DEMO_EMAIL, DEMO_SLUG } from "./config";
import { DEFAULT_TIMEZONE, addDays, dayStart, todayKey } from "./dates";
import type { QueryFn } from "./db";
import { DEMO_BUSINESS, DEMO_MENU, DEMO_ORDERS, DEMO_PLANS } from "./demo-menu";
import { serializeOptions, type ChosenOption, type OptionGroup } from "./options";
import { computeTotals } from "./orders";
import { hashPassword } from "./password";

/**
 * Negocio de ejemplo. Se crea una sola vez, cuando la base de datos local
 * está vacía, para que la app tenga algo que mostrar desde el primer arranque
 * (devuelve true si lo creó):
 * menú con opciones, zonas de domicilio, un cupón, publicidad, horario, unos
 * pedidos de muestra y dos planes de ejemplo para la administración.
 * Las imágenes están en la carpeta seed/img.
 */

function readSeedImage(file: string): Buffer | null {
  try {
    return fs.readFileSync(path.join(/* turbopackIgnore: true */ process.cwd(), "seed", "img", file));
  } catch {
    return null;
  }
}

const newId = () => randomBytes(4).toString("hex");

type SeededProduct = { id: string; priceCents: number; costCents: number; options: OptionGroup[] };

export async function seedDemo(
  query: QueryFn,
  transaction: <T>(fn: (query: QueryFn) => Promise<T>) => Promise<T>,
  options: {
    /**
     * Contraseña de la cuenta de ejemplo (propia de cada instalación), o null
     * para crearla sin contraseña válida: el menú se puede ver, pero nadie
     * puede entrar al panel hasta que el administrador le ponga una.
     */
    demoPassword: string | null;
    /**
     * true: solo se crea en una base sin ninguna cuenta (el arranque normal en
     * el computador). Así no reaparece si alguien lo eliminó, ni se cuela en
     * una base restaurada desde una copia de seguridad.
     */
    onlyIfEmpty: boolean;
  },
): Promise<boolean> {
  const existing = await query(
    options.onlyIfEmpty
      ? "select 1 as found from users limit 1"
      : "select 1 as found from businesses where slug = $1 union all select 1 from users where email = $2",
    options.onlyIfEmpty ? [] : [DEMO_SLUG, DEMO_EMAIL],
  );
  if (existing.length > 0) return false;

  const passwordHash = options.demoPassword ? await hashPassword(options.demoPassword) : "!";

  await transaction(async (q) => {
    /* ---------- Planes de ejemplo ---------- */

    // Ninguno queda marcado "para comercios nuevos": así nadie vence sin que el administrador lo decida.
    let demoPlanId: string | null = null;
    const plans = await q<{ count: number }>("select count(*)::int as count from plans");
    if (Number(plans[0]?.count ?? 0) === 0) {
      for (const [position, plan] of DEMO_PLANS.entries()) {
        const [row] = await q<{ id: string }>(
          "insert into plans (name, price_cents, max_products, position) values ($1, $2, $3, $4) returning id",
          [plan.name, plan.price * 100, plan.maxProducts, position],
        );
        demoPlanId = row.id; // el negocio de ejemplo queda con el último (el más completo)
      }
    }

    const [user] = await q<{ id: string }>(
      "insert into users (email, password_hash) values ($1, $2) returning id",
      [DEMO_EMAIL, passwordHash],
    );
    const [business] = await q<{ id: string }>(
      `insert into businesses
         (owner_id, name, slug, whatsapp, currency, payment_methods, timezone, delivery_modes, schedule,
          free_delivery_from_cents, plan_id)
       values ($1, $2, $3, '', $4, $5, $6, $7, $8, $9, $10) returning id`,
      [
        user.id,
        DEMO_BUSINESS.name,
        DEMO_SLUG,
        DEMO_BUSINESS.currency,
        DEMO_BUSINESS.paymentMethods.join("\n"),
        DEFAULT_TIMEZONE,
        DEMO_BUSINESS.deliveryModes,
        JSON.stringify(DEMO_BUSINESS.schedule),
        DEMO_BUSINESS.freeDeliveryFrom * 100,
        demoPlanId,
      ],
    );

    const saveImage = async (file: string): Promise<string | null> => {
      const bytes = readSeedImage(file);
      if (!bytes) return null;
      const mime = file.endsWith(".jpg") ? "image/jpeg" : "image/png";
      const [image] = await q<{ id: string }>(
        "insert into images (business_id, mime, bytes) values ($1, $2, $3) returning id",
        [business.id, mime, bytes],
      );
      return image.id;
    };

    const logoId = await saveImage(DEMO_BUSINESS.logo);
    if (logoId) await q("update businesses set logo_image_id = $2 where id = $1", [business.id, logoId]);

    /* ---------- Zonas de domicilio y cupón ---------- */

    for (const [position, zone] of DEMO_BUSINESS.zones.entries()) {
      await q("insert into delivery_zones (business_id, name, fee_cents, position) values ($1, $2, $3, $4)", [
        business.id,
        zone.name,
        zone.fee * 100,
        position,
      ]);
    }
    const coupon = DEMO_BUSINESS.coupon;
    const couponUses = DEMO_ORDERS.filter((order) => order.coupon && order.status !== "cancelado").length;
    await q(
      "insert into coupons (business_id, code, kind, value, min_subtotal_cents, used_count) values ($1, $2, 'percent', $3, $4, $5)",
      [business.id, coupon.code, coupon.percent, coupon.minSubtotal * 100, couponUses],
    );

    /* ---------- Menú ---------- */

    const products = new Map<string, SeededProduct>();
    for (const [categoryIndex, group] of DEMO_MENU.entries()) {
      const [category] = await q<{ id: string }>(
        "insert into categories (business_id, name, position) values ($1, $2, $3) returning id",
        [business.id, group.category, categoryIndex],
      );
      for (const [productIndex, product] of group.products.entries()) {
        const imageId = await saveImage(product.image);
        const productOptions: OptionGroup[] = (product.options ?? []).map((optionGroup) => ({
          id: newId(),
          name: optionGroup.name,
          min: optionGroup.min,
          max: optionGroup.max,
          choices: optionGroup.choices.map((choice) => ({
            id: newId(),
            name: choice.name,
            priceCents: (choice.price ?? 0) * 100,
            costCents: choice.cost === undefined ? null : choice.cost * 100,
            available: true,
          })),
        }));
        const [row] = await q<{ id: string }>(
          `insert into products
             (business_id, category_id, name, description, price_cents, image_id, is_available, position, cost_cents, stock, options)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
          [
            business.id,
            category.id,
            product.name,
            product.description,
            product.price * 100,
            imageId,
            product.available !== false,
            productIndex,
            product.cost * 100,
            product.stock ?? null,
            serializeOptions(productOptions),
          ],
        );
        products.set(product.name, {
          id: row.id,
          priceCents: product.price * 100,
          costCents: product.cost * 100,
          options: productOptions,
        });
      }
    }

    /* ---------- Publicidad ---------- */

    for (const [position, banner] of DEMO_BUSINESS.banners.entries()) {
      const imageId = await saveImage(banner.image);
      if (!imageId) continue;
      await q("insert into banners (business_id, slot, image_id, title, position) values ($1, $2, $3, $4, $5)", [
        business.id,
        banner.slot,
        imageId,
        banner.title,
        position,
      ]);
    }

    /* ---------- Pedidos de muestra ---------- */

    const today = todayKey(DEFAULT_TIMEZONE);
    const now = Date.now();
    let number = 0;
    // Los de hoy se crean "hace un rato" para que nunca queden en el futuro.
    let minutesAgo = 20 + 30 * DEMO_ORDERS.filter((order) => order.daysAgo === 0).length;

    for (const order of DEMO_ORDERS) {
      let createdAt: Date;
      if (order.daysAgo === 0) {
        minutesAgo -= 30;
        createdAt = new Date(now - minutesAgo * 60_000);
      } else {
        const [hours, minutes] = order.time.split(":").map(Number);
        const midnight = dayStart(addDays(today, -order.daysAgo), DEFAULT_TIMEZONE);
        createdAt = new Date(midnight.getTime() + (hours * 60 + minutes) * 60_000);
      }

      // Cada renglón: el producto con las opciones elegidas (por su nombre) y lo que suman.
      const lines = order.items.flatMap(([name, quantity, chosenNames = []]) => {
        const product = products.get(name);
        if (!product) return [];
        const chosen: ChosenOption[] = [];
        let extraCost = 0;
        for (const optionGroup of product.options) {
          for (const choice of optionGroup.choices) {
            if (!chosenNames.includes(choice.name)) continue;
            chosen.push({ group: optionGroup.name, name: choice.name, priceCents: choice.priceCents });
            extraCost += choice.costCents ?? 0;
          }
        }
        const priceCents = product.priceCents + chosen.reduce((sum, choice) => sum + choice.priceCents, 0);
        return [{ id: product.id, name, quantity, priceCents, costCents: product.costCents + extraCost, chosen }];
      });
      if (lines.length === 0) continue;

      const zone = DEMO_BUSINESS.zones.find((candidate) => candidate.name === order.zone);
      const totals = computeTotals({
        lines,
        delivery: order.delivery,
        deliveryFeeCents: zone ? zone.fee * 100 : null,
        freeDeliveryFromCents: DEMO_BUSINESS.freeDeliveryFrom * 100,
        coupon: order.coupon ? { kind: "percent", value: coupon.percent } : null,
        currency: DEMO_BUSINESS.currency,
      });
      const costCents = lines.reduce((sum, line) => sum + line.costCents * line.quantity, 0);
      const completedAt = order.status === "completado" ? new Date(createdAt.getTime() + 35 * 60_000) : null;
      number += 1;

      const [saved] = await q<{ id: string }>(
        `insert into orders
           (business_id, number, status, customer_name, customer_phone, delivery_mode, address, delivery_zone,
            payment_method, notes, currency, subtotal_cents, delivery_cents, delivery_free, discount_cents, coupon_code,
            total_cents, cost_cents, profit_cents, public_token, privacy_consent, created_at, updated_at, completed_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, 'aviso', $21, $22, $23)
         returning id`,
        [
          business.id,
          number,
          order.status,
          order.name,
          order.phone,
          order.delivery,
          order.address ?? "",
          order.delivery === "domicilio" ? (zone?.name ?? "") : "",
          order.payment,
          order.notes ?? "",
          DEMO_BUSINESS.currency,
          totals.subtotalCents,
          totals.deliveryCents,
          totals.deliveryFree,
          totals.discountCents,
          order.coupon ? coupon.code : "",
          totals.totalCents,
          costCents,
          totals.subtotalCents - costCents - totals.discountCents,
          randomBytes(9).toString("base64url"),
          createdAt.toISOString(),
          (completedAt ?? createdAt).toISOString(),
          completedAt ? completedAt.toISOString() : null,
        ],
      );
      for (const [position, line] of lines.entries()) {
        await q(
          `insert into order_items (order_id, product_id, name, quantity, unit_price_cents, unit_cost_cents, options, position)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            saved.id,
            line.id,
            line.name,
            line.quantity,
            line.priceCents,
            line.costCents,
            line.chosen.length > 0 ? JSON.stringify(line.chosen) : "",
            position,
          ],
        );
      }
    }
    await q("update businesses set order_seq = $2 where id = $1", [business.id, number]);
  });
  return true;
}
