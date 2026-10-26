/**
 * Estructura de la base de datos (PostgreSQL).
 *
 * Se aplica sola la primera vez que arranca la app, tanto en la base local
 * como en una base en la nube. Todas las sentencias son "if not exists", así
 * que volver a ejecutarlas no borra nada.
 *
 * Los precios se guardan como enteros en centavos (price_cents) para evitar
 * errores de redondeo: 36.000 pesos = 3600000.
 *
 * Para cambiar la estructura más adelante, agrega al final sentencias que se
 * puedan repetir sin daño (create ... if not exists, alter table ... add
 * column if not exists).
 */
export const SCHEMA_SQL = `
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

create table if not exists sessions (
  token_hash text primary key,
  user_id    uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_idx on sessions (user_id);

create table if not exists businesses (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null unique references users(id) on delete cascade,
  name            text not null,
  slug            text not null unique,
  whatsapp        text not null default '',
  currency        text not null default 'COP',
  payment_methods text not null default 'Efectivo',
  logo_image_id   uuid,
  created_at      timestamptz not null default now()
);

create table if not exists images (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  mime        text not null,
  bytes       bytea not null,
  created_at  timestamptz not null default now()
);
create index if not exists images_business_idx on images (business_id);

create table if not exists categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name        text not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists categories_business_idx on categories (business_id, position);

create table if not exists products (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  category_id  uuid not null references categories(id) on delete cascade,
  name         text not null,
  description  text not null default '',
  price_cents  integer not null check (price_cents >= 0),
  image_id     uuid references images(id) on delete set null,
  is_available boolean not null default true,
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists products_business_idx on products (business_id, category_id, position);

-- ---------------------------------------------------------------------------
-- Versión 2: pedidos guardados, costos, existencias y ajustes de entrega.
-- Las columnas nuevas se agregan con "if not exists": una base de datos de la
-- versión anterior se actualiza sola, sin perder nada.
-- ---------------------------------------------------------------------------

alter table businesses add column if not exists order_seq          integer not null default 0;
alter table businesses add column if not exists timezone           text    not null default 'America/Bogota';
alter table businesses add column if not exists is_suspended       boolean not null default false;
alter table businesses add column if not exists delivery_modes     text    not null default 'domicilio,recoger';
alter table businesses add column if not exists delivery_fee_cents integer not null default 0;
alter table businesses add column if not exists min_order_cents    integer not null default 0;

-- cost_cents: lo que le cuesta el producto al negocio (opcional; solo lo ve el dueño).
-- stock: existencias (opcional; vacío = no se controlan).
alter table products add column if not exists cost_cents integer;
alter table products add column if not exists stock      integer;

create table if not exists orders (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references businesses(id) on delete cascade,
  number         integer not null,              -- consecutivo por negocio: 1, 2, 3…
  status         text not null default 'nuevo', -- nuevo | preparando | completado | cancelado
  customer_name  text not null,
  customer_phone text not null,
  delivery_mode  text not null,                 -- domicilio | recoger | local
  address        text not null default '',      -- dirección, o mesa si es en el local
  payment_method text not null default '',
  notes          text not null default '',
  currency       text not null,
  subtotal_cents bigint not null,
  delivery_cents bigint not null default 0,
  discount_cents bigint not null default 0,     -- reservado para cupones
  total_cents    bigint not null,
  cost_cents     bigint,                        -- costo de los productos que tenían costo registrado
  profit_cents   bigint,                        -- venta menos costo de esos mismos productos
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  completed_at   timestamptz,
  unique (business_id, number)
);
create index if not exists orders_business_created_idx on orders (business_id, created_at desc);
create index if not exists orders_created_idx on orders (created_at desc);

-- Cada renglón guarda nombre, precio y costo como estaban al hacer el pedido:
-- si luego cambia el producto, el pedido antiguo no se altera.
create table if not exists order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references orders(id) on delete cascade,
  product_id       uuid references products(id) on delete set null,
  name             text not null,
  quantity         integer not null check (quantity > 0),
  unit_price_cents integer not null,
  unit_cost_cents  integer,
  position         integer not null default 0
);
create index if not exists order_items_order_idx on order_items (order_id);

-- Visitas al menú, una fila por negocio y día.
create table if not exists menu_visits (
  business_id uuid not null references businesses(id) on delete cascade,
  day         date not null,
  visits      integer not null default 0,
  primary key (business_id, day)
);

-- Tienda abierta o cerrada.
-- open_mode: abierto | cerrado | horario (abre y cierra sola según "schedule").
-- schedule: horario semanal en texto JSON; vacío = sin horario definido.
alter table businesses add column if not exists open_mode text not null default 'abierto';
alter table businesses add column if not exists schedule  text not null default '';

-- Publicidad del menú: imágenes del carrusel principal y de la barra pequeña.
create table if not exists banners (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  slot        text not null,               -- principal | barra
  image_id    uuid not null references images(id) on delete cascade,
  title       text not null default '',    -- qué dice la imagen, para quien no puede verla
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists banners_business_idx on banners (business_id, slot, position);

-- ---------------------------------------------------------------------------
-- Versión 3: opciones de producto, zonas de domicilio, cupones, seguimiento
-- del pedido, planes y pagos de los comercios, ajustes del servicio y
-- recuperación de contraseña.
-- ---------------------------------------------------------------------------

-- Opciones del producto (tamaños, adicionales) como texto JSON; vacío = sin opciones.
alter table products add column if not exists options text not null default '';
-- Opciones elegidas en cada renglón del pedido, tal como estaban al pedir.
alter table order_items add column if not exists options text not null default '';

-- public_token: código del enlace de seguimiento que recibe el cliente.
-- privacy_consent: cómo aceptó el aviso de datos ('' = pedido anterior, 'aviso' o 'casilla').
alter table orders add column if not exists public_token    text;
alter table orders add column if not exists coupon_code     text not null default '';
alter table orders add column if not exists delivery_zone   text not null default '';
alter table orders add column if not exists privacy_consent text not null default '';
-- delivery_free: a domicilio y sin cobro (por el valor del pedido, por cupón o por la zona).
-- Con delivery_cents = 0 y delivery_free = false, el domicilio quedó "por confirmar".
alter table orders add column if not exists delivery_free   boolean not null default false;
create unique index if not exists orders_public_token_idx on orders (public_token);
update orders set public_token = replace(gen_random_uuid()::text, '-', '') where public_token is null;

-- Domicilio gratis a partir de este valor en productos; 0 = no aplica.
alter table businesses add column if not exists free_delivery_from_cents integer not null default 0;

-- Zonas o barrios de domicilio, cada una con su precio.
create table if not exists delivery_zones (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name        text not null,
  fee_cents   integer not null default 0 check (fee_cents >= 0),
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists delivery_zones_business_idx on delivery_zones (business_id, position);

-- Cupones de descuento. kind: percent (value = porcentaje), amount (value = centavos) o free_delivery.
create table if not exists coupons (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references businesses(id) on delete cascade,
  code               text not null,
  kind               text not null,
  value              integer not null default 0,
  min_subtotal_cents integer not null default 0,
  ends_on            date,                         -- último día en que sirve; vacío = sin fecha límite
  max_uses           integer,                      -- vacío = sin límite
  used_count         integer not null default 0,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  unique (business_id, code)
);

-- Planes que el dueño del servicio les cobra a los comercios.
create table if not exists plans (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  price_cents  bigint not null default 0,          -- precio por mes, en la moneda del servicio
  max_products integer,                            -- vacío = sin límite
  is_default   boolean not null default false,     -- el que reciben los comercios que se registran solos
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);

-- plan_id y paid_until (último día pagado). Sin fecha, el comercio no vence nunca.
alter table businesses add column if not exists plan_id    uuid references plans(id) on delete set null;
alter table businesses add column if not exists paid_until date;

-- Pagos registrados a mano. Si el comercio se elimina, el pago se conserva con su nombre.
create table if not exists payments (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid references businesses(id) on delete set null,
  business_name text not null,
  plan_name     text not null default '',
  amount_cents  bigint not null,
  currency      text not null,
  months        integer not null default 1,
  paid_on       date not null,
  period_from   date,
  period_to     date,
  method        text not null default '',
  note          text not null default '',
  created_at    timestamptz not null default now()
);
create index if not exists payments_paid_on_idx on payments (paid_on desc);
create index if not exists payments_business_idx on payments (business_id, paid_on desc);

-- Ajustes generales del servicio (días de prueba, texto del aviso de datos…).
create table if not exists settings (
  key   text primary key,
  value text not null
);

-- Enlaces para restablecer la contraseña: se guarda solo la huella del código.
create table if not exists password_resets (
  token_hash text primary key,
  user_id    uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists password_resets_user_idx on password_resets (user_id);

create table if not exists game_scores (
  id         bigserial primary key,
  game       text not null,
  name       text not null,
  score      integer not null,
  created_at timestamptz not null default now()
);
create index if not exists game_scores_top_idx on game_scores (game, score desc);

-- Cada vez que alguien escribe un código válido en la consola de los juegos escondidos.
create table if not exists game_code_uses (
  id         bigserial primary key,
  code       text not null,
  created_at timestamptz not null default now()
);
`;
