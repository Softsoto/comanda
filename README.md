<p align="center">
  <img src="docs/images/banner.png" alt="Comanda" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/pedidos-por%20WhatsApp-25D366?logo=whatsapp&logoColor=white" alt="WhatsApp">
  <img src="https://img.shields.io/badge/gratis-y%20libre-22c55e" alt="Gratis">
</p>

# Comanda

Menú digital para pequeños negocios. El dueño crea su menú con fotos y precios, lo comparte con un enlace o un código QR, y sus clientes arman el pedido y lo envían por WhatsApp. Tú, como dueño del servicio, registras varios comercios, les cobras un plan y los administras desde un solo lugar.

"Comanda" es un nombre provisional: se cambia en un solo archivo (ver [Personalizar](#10-personalizar)).

> 💚 **Comanda es gratis y de código abierto.** La idea de hacerlo libre —para que cualquier negocio pequeño pudiera usarlo sin pagar— nació gracias a **@nathabermudez03**, la gran inspiración de este proyecto. Gracias, Natha.

## Capturas

<table>
  <tr>
    <td width="50%"><img src="docs/images/menu.png" alt="Menú del cliente"><br><sub><b>Menú del cliente</b> (<code>/m/tu-negocio</code>): productos, cupón, domicilio y pedido por WhatsApp</sub></td>
    <td width="50%"><img src="docs/images/panel.png" alt="Panel del negocio"><br><sub><b>Panel del negocio</b> (<code>/panel</code>): pedidos, menú, reportes y tienda</sub></td>
  </tr>
</table>

**Qué incluye**

- **Menú del cliente** (`/m/tu-negocio`): productos por categorías, ficha de cada producto con la foto en grande, **tamaños y adicionales**, carrito, **zona de domicilio**, **cupón de descuento**, datos de entrega y pago, y botón que registra el pedido y abre WhatsApp con el mensaje ya escrito.
- **Seguimiento para el cliente** (`/p/…`): un enlace donde ve cómo va su pedido: recibido, en preparación, en camino y entregado.
- **Panel de cada negocio** (`/panel`):
  - **Pedidos**: cada pedido queda guardado con su número. Se marcan como en preparación, en camino (o listo para recoger), completados o cancelados, y se imprimen como comanda. **Aviso con sonido** cuando entra uno nuevo.
  - **Excel**: pedidos, productos vendidos, ventas, ganancias, clientes e inventario en un archivo.
  - **Reportes**: ventas, pedido promedio, ganancia, visitas y productos más vendidos por rango de fechas, y la lista de **clientes frecuentes**.
  - **Menú**: categorías y productos con foto, precio, costo, existencias y **opciones** (tamaños, sabores, adicionales).
  - **Tienda**: datos del negocio, **entregas** (domicilio fijo o por zonas, gratis desde un valor, pedido mínimo), **abierto / cerrado / horarios**, **publicidad** y **cupones**.
- **Administración del servicio** (`/admin`), para ti: comercios, pedidos de todos, **planes y pagos** (con vencimiento y suspensión automática), **ajustes**, **aviso de tratamiento de datos** y **copia de seguridad**.
- **Recuperar la contraseña por correo**, cuando conectas un servicio de correo.
- **Base de datos incluida**: en tu computador funciona sin crear cuentas en ningún servicio. Para publicarla en internet se conecta a una base PostgreSQL (Supabase sirve).

**Novedades de la versión 3**

Opciones de producto · aviso con sonido · planes y cobro a los comercios · seguimiento del pedido · cupones y domicilio gratis · domicilio por zonas · clientes frecuentes · recuperar contraseña por correo · copia de seguridad con un botón · aviso de tratamiento de datos.

Además cambió una cosa que debes saber: **la cuenta de ejemplo ya no usa la contraseña `demo1234`**. Era la misma en todas las instalaciones, y esa cuenta puede administrar el servicio. Ahora cada instalación crea su propia contraseña y te la muestra en la ventana de inicio (ver [Qué probar primero](#2-qué-probar-primero)).

---

## 1. Probarla en tu computador

### Windows

1. Instala **Node.js**: entra a <https://nodejs.org>, descarga la versión **LTS** e instálala con las opciones que trae por defecto.
2. Descomprime este proyecto en una carpeta que **no** esté dentro de OneDrive ni de otra nube, por ejemplo `C:\comanda`. (La sincronización bloquea archivos de la base de datos mientras la app trabaja.)
3. Haz doble clic en **`iniciar.bat`**.
   - La primera vez descarga lo necesario y prepara la app. Tarda unos minutos y necesita internet.
   - Si Windows pregunta por el firewall, elige **Permitir** en redes privadas. Hace falta para abrirla desde el celular.
4. Cuando termine se abre el navegador en <http://localhost:3000>, y en la ventana negra quedan escritas las direcciones y la **contraseña de la cuenta de ejemplo**.

Para apagarla, cierra la ventana negra. Para volver a abrirla, doble clic otra vez en `iniciar.bat` (ya no tarda).

### Mac o Linux

Instala Node.js LTS, abre la Terminal en la carpeta del proyecto y escribe:

```bash
./iniciar.sh
```

En Mac también puedes hacer doble clic en `iniciar.command`. Si el sistema lo bloquea por venir de internet, haz clic derecho sobre el archivo y elige **Abrir**.

---

## 2. Qué probar primero

| Qué | Dónde |
| --- | --- |
| Hacer un pedido como cliente | <http://localhost:3000/m/demo> |
| Entrar al panel del negocio de ejemplo | <http://localhost:3000/entrar> con el correo `demo@comanda.test` y la contraseña que aparece en la ventana de inicio |
| Ver la administración del servicio | Entra con la cuenta de ejemplo y abre **Administración** (arriba a la derecha) |
| Crear tu propio negocio | <http://localhost:3000/registro> |

**La contraseña de la cuenta de ejemplo** es distinta en cada instalación (algo como `k3m9-x2pd`). La ves en la ventana de inicio, en la línea "Cuenta de ejemplo", y queda guardada en el archivo `data/cuenta-de-ejemplo.txt`. Si la cambias desde el panel (**Tienda → Datos**), ese archivo se borra solo.

El negocio de ejemplo ("El Antojo") trae un menú con opciones, tres zonas de domicilio, el cupón **`BIENVENIDO10`**, publicidad, un horario y **trece pedidos de muestra** con clientes inventados, para que el panel, los reportes y el Excel tengan algo que mostrar.

**Un recorrido de diez minutos**

1. **Pide como cliente.** Abre el menú de ejemplo. En *Hamburguesa clásica* pulsa **Añadir**: se abre su ficha para elegir el término y los adicionales. Añade también unas *Papas a la francesa* (te pide el tamaño).
2. Abre el pedido, elige **A domicilio** y una **zona**: el domicilio se suma solo. Escribe el cupón `BIENVENIDO10` y pulsa **Aplicar**. Envía el pedido: verás su número (por ejemplo, "Pedido #14") y el botón **Ver cómo va mi pedido**.
3. **Atiéndelo.** Entra al panel y abre **Pedidos**: ahí está. Pulsa **Preparar** y luego **En camino**, y mira cómo cambia la página de seguimiento del cliente. Márcalo como completado y ábrelo para ver su ganancia e imprimir la comanda.
4. En **Pedidos**, pulsa **Activar aviso**. Haz otro pedido desde el menú (en otra pestaña): en unos segundos el panel suena y muestra "Nuevo pedido".
5. Pulsa **Exportar a Excel** y abre el archivo.
6. En **Reportes → Clientes** verás quién ha pedido, cuántas veces y cuánto ha comprado.
7. En **Tienda** recorre las pestañas: **Entregas** (zonas y domicilio gratis), **Horarios**, **Publicidad** y **Cupones**.
8. Abre **Administración**: en **Planes** hay dos planes de ejemplo, en la ficha de un comercio se registra un pago, y en **Ajustes** está la copia de seguridad.

**Para ver un pedido llegar a tu WhatsApp:** entra al panel de ejemplo, ve a **Tienda**, escribe tu número y guarda. Luego haz un pedido en el menú de ejemplo.

**Desde el celular:** conéctalo a la misma red wifi que el computador y abre la dirección que muestra la ventana de inicio (algo como `http://192.168.1.20:3000`). En el celular, el botón abre directamente la app de WhatsApp.

> Mientras la app está abierta, cualquier dispositivo conectado a tu misma red puede ver los menús y la página de entrar. Para entrar a un panel hace falta su contraseña. Si estás en una red pública, ábrela con `npm run iniciar -- --solo-local`.

---

## 3. Cómo funciona

### El pedido

1. El cliente arma su pedido y toca **Enviar pedido por WhatsApp**.
2. En ese momento el pedido **queda guardado** en el sistema con su número (1, 2, 3… por cada negocio) y se abre WhatsApp con el mensaje escrito.
3. El cliente toca enviar en WhatsApp y al negocio le llega el mensaje, que termina con el enlace de seguimiento.

Si el cliente no toca enviar en WhatsApp, el mensaje no llega, pero el pedido **sí aparece en el panel**, con su teléfono para escribirle. Por eso conviene tener el panel abierto y el aviso con sonido activado.

Los precios, descuentos, domicilio y totales los calcula siempre el servidor con los datos del menú, no con lo que envía el navegador del cliente.

### Estados de un pedido y seguimiento

**Nuevo** → **En preparación** → **Listo / en camino** → **Completado**, o **Cancelado**.

- El tercer estado se llama **En camino** si el pedido es a domicilio, **Listo para recoger** si el cliente pasa por él y **Listo** si come en el local.
- El cliente ve esos cambios en su **enlace de seguimiento**, que recibe al confirmar el pedido y dentro del mensaje de WhatsApp. La página se actualiza sola y no muestra sus datos personales. Desde el detalle del pedido puedes copiar el enlace o enviárselo por WhatsApp.
- Solo los pedidos **completados** cuentan como venta en los reportes y en el Excel.
- Al **cancelar**, las unidades vuelven al inventario y el cupón recupera ese uso.

### Aviso con sonido

En **Pedidos** está el interruptor **Aviso con sonido**. Al activarlo, ese dispositivo suena y muestra "Nuevo pedido" cuando entra uno, en cualquier página del panel. Se activa en cada celular o computador por separado.

Funciona mientras el panel esté abierto en el navegador. Con la pantalla apagada o el navegador cerrado no suena: para eso haría falta una app instalada o notificaciones del sistema, que esta versión no tiene.

### Tamaños, adicionales y extras

Al editar un producto, en **Opciones**, creas grupos como "Tamaño" o "Adiciones". Para cada grupo decides si el cliente **debe** elegir (un tamaño) o **puede** elegir (extras), y si es una opción o varias. Cada opción puede sumar un valor al precio y tener su propio costo.

- Un producto con opciones abre su ficha al pulsar **Añadir**, para que el cliente elija.
- Si el precio cambia según una opción obligatoria (el tamaño), la tarjeta dice "Desde $ …".
- Una opción se puede marcar como no disponible sin borrarla.
- Las existencias se llevan por producto, no por opción.

### Entregas y domicilio

En **Tienda → Entregas** eliges cómo entregas (a domicilio, para recoger, en el local) y cuánto cobras:

- **Costo fijo** de domicilio, o **zonas**: cada barrio o sector con su precio. Si hay zonas, el cliente elige la suya y el domicilio se suma solo.
- **Domicilio gratis desde** un valor de compra.
- **Pedido mínimo**.

Si no hay ni costo fijo ni zonas, el pedido dice que el domicilio está "por confirmar" y lo acuerdas con el cliente por WhatsApp.

### Cupones

En **Tienda → Cupones** creas códigos de descuento: un **porcentaje**, un **valor fijo** o **domicilio gratis**. Cada cupón puede pedir una compra mínima, vencer en una fecha y tener un número máximo de usos. Se pueden pausar. El cliente escribe el código al hacer su pedido; si no tienes cupones, ese campo no aparece en tu menú.

El descuento se resta de la ganancia del pedido.

### Clientes frecuentes

**Reportes → Clientes** junta los pedidos por número de teléfono: cuántas veces ha pedido cada cliente, cuánto ha comprado y cuándo fue la última vez, con un botón para escribirle por WhatsApp. Se puede buscar y ordenar, y también sale en el Excel.

Si un cliente pide que borres sus datos, abre sus pedidos y pulsa **Borrar sus datos**: se quitan su nombre, teléfono, dirección y notas. Los pedidos se conservan para tus cuentas.

### Ganancias y existencias (opcional)

Al editar un producto puedes escribir su **costo** (lo que te cuesta a ti) y sus **existencias**:

- Con el costo, cada pedido muestra su ganancia (venta menos costo, menos el descuento), y los reportes y el Excel la suman. Los productos sin costo no entran en esa cuenta.
- Con las existencias, cada pedido descuenta unidades y el producto aparece como agotado cuando llega a cero. Si dejas el campo vacío, no se controla.

El cliente nunca ve los costos.

### Abierto, cerrado y horarios

La franja de arriba del panel tiene tres opciones:

- **Abierto**: recibe pedidos siempre.
- **Cerrado**: no recibe pedidos hasta que la abras.
- **Según horario**: abre y cierra sola con las horas de **Tienda → Horarios** (admite dos tramos por día y cierres después de medianoche).

Con la tienda cerrada el cliente puede ver el menú, pero no enviar pedidos, y ve a qué hora abre.

### Publicidad

En **Tienda → Publicidad** hay dos espacios opcionales: el **carrusel principal** (hasta 6 imágenes, el doble de anchas que altas) y la **barra pequeña** (hasta 4, cuatro veces más anchas que altas). Si la imagen tiene otra forma, se recorta y puedes elegir qué parte mostrar. Sin imágenes, el menú se ve como siempre.

### Aviso de tratamiento de datos

Cada menú enlaza a una página que explica qué datos se le piden al cliente y para qué (`/m/tu-negocio/privacidad`). El texto se cambia en **Administración → Ajustes**, y ahí también decides si el cliente debe marcar una casilla para aceptarlo o si basta con mostrarle el aviso junto al botón de enviar.

> **El texto incluido es una plantilla general, no un documento legal revisado.** La escribí siguiendo lo que piden las normas colombianas de protección de datos (Ley 1581 de 2012 y Decreto 1377 de 2013) para un aviso de privacidad: quién responde por los datos, para qué se usan y qué derechos tiene la persona. No soy abogado. Antes de usar el servicio con clientes reales, pídele a un abogado que lo revise y lo ajuste a tu caso; en Colombia la autoridad es la Superintendencia de Industria y Comercio. Si quieres la opción más prudente, activa la casilla de aceptación.

---

## 4. Administración del servicio

La dirección `/admin` es para quien ofrece la plataforma a varios comercios. Tiene cinco secciones.

### Comercios y pedidos

- Ver todos los comercios, con su plan, su vencimiento, sus productos y sus pedidos recientes.
- **Crear un comercio** y entregarle su correo y contraseña (útil si cierras el registro público con `ALLOW_SIGNUP=false`).
- **Suspender** un comercio: su menú deja de mostrarse y no recibe pedidos. Sus datos se conservan y se puede reactivar.
- **Cambiarle la contraseña** a un comercio que la olvidó.
- Ver los pedidos de todos y **descargarlos en Excel**, juntos o por comercio.
- **Eliminar** un comercio con todos sus datos (no se puede deshacer).

### Planes y cobro

La app **lleva la cuenta de quién te pagó; no cobra con tarjeta**. Tú recibes el dinero como prefieras (transferencia, Nequi, efectivo) y registras el pago.

1. En **Planes**, crea tus planes: nombre, precio al mes y, si quieres, un tope de productos. Vienen dos de ejemplo ("Básico" y "Completo"), que puedes cambiar o borrar.
2. Si quieres que los comercios nuevos empiecen con un plan y unos días de prueba, pulsa **Darlo a los nuevos** en ese plan. Los días de prueba se cambian en **Ajustes** (vienen en 15).
3. Cuando un comercio te pague, abre su ficha y pulsa **Registrar pago**: eliges cuántos meses pagó y su fecha de vencimiento se extiende sola.
4. **Pagos** muestra a quién hay que cobrarle (por vencer o vencidos) y lo que has recibido en cada período.

Qué pasa cuando un comercio no paga:

- Desde **5 días antes** de vencer, ve un aviso en su panel, con un botón para escribirte si pusiste tu WhatsApp de soporte en **Ajustes**.
- Al vencer tiene unos **días de gracia** (vienen en 3). Su menú sigue funcionando.
- Después, su menú **deja de mostrarse** y no recibe pedidos hasta que registres un pago. Puede seguir entrando a su panel, y sus datos no se borran.

Un comercio **sin fecha de vencimiento** no se bloquea nunca. Así quedan los comercios que ya tenías al actualizar, y los nuevos mientras no marques ningún plan "para los nuevos": nadie queda bloqueado sin que tú lo decidas.

### Ajustes

Días de prueba y de gracia, moneda de los planes, tu WhatsApp de soporte, el aviso de tratamiento de datos, el correo y la copia de seguridad.

### Quién es administrador

- **En tu computador**, sin configurar nada, lo es la cuenta de ejemplo (`demo@comanda.test`, con la contraseña de la ventana de inicio).
- **En internet** lo decides con la variable `ADMIN_EMAILS` (uno o varios correos separados por comas). Hazlo **en este orden**:
  1. Publica la app y **regístrate** con tu correo como cualquier negocio.
  2. Después añade `ADMIN_EMAILS=tu@correo.com` y vuelve a publicar.

  El orden importa: un correo que ya está en `ADMIN_EMAILS` y todavía no tiene cuenta no se puede registrar desde la página pública. Así nadie puede adelantarse y quedarse con tu acceso.

Quien no es administrador recibe "página no encontrada" al abrir `/admin`.

---

## 5. Recuperar la contraseña por correo

En la página de entrar hay un enlace **¿Olvidaste tu contraseña?**. El comercio escribe su correo y recibe un enlace que sirve una sola vez y durante una hora.

- **En tu computador, sin configurar nada**, los correos no se envían: cada mensaje queda guardado como archivo de texto en `data/correos`, para que puedas probar el recorrido completo.
- **Para enviarlos de verdad** necesitas un servicio de correo que te dé datos **SMTP** (servidor, puerto, usuario y contraseña). Sirve el correo de tu hosting o dominio, o un servicio de envío de correos. Con esos datos se escriben tres variables:

  ```bash
  SMTP_URL=smtps://usuario:contraseña@servidor:465
  EMAIL_FROM=Mi Servicio <avisos@tudominio.com>
  APP_URL=https://menu.tudominio.com
  ```

  - `SMTP_URL`: usa `smtps://` con el puerto 465, o `smtp://` con el puerto 587. Si el usuario o la contraseña tienen símbolos, hay que escribirlos codificados: `@` es `%40`, `#` es `%23`, `:` es `%3A`. Por ejemplo, el usuario `avisos@tudominio.com` se escribe `avisos%40tudominio.com`.
  - `EMAIL_FROM`: el correo que aparece como remitente. Debe ser uno que tu servicio de correo te permita usar.
  - `APP_URL`: la dirección pública de tu página. El enlace del correo se arma con ella, nunca con la dirección que trae cada visita: así nadie puede hacer que el enlace lleve a otro sitio. En Vercel normalmente no hace falta, porque se toma del dominio del proyecto. Si falta, la recuperación por correo queda apagada y **Ajustes** te lo dice.

En **Administración → Ajustes → Correo** se ve si quedó conectado, y hay un botón para **enviar un correo de prueba**.

Mientras no conectes el correo, la contraseña de un comercio la cambias tú en su ficha o con `npm run clave`.

> No pude probar el envío con un proveedor real desde aquí. Lo probé contra un servidor de correo de prueba: envío, remitente, enlace, servidor caído y contraseña equivocada.

---

## 6. Datos y copias de seguridad

En tu computador todo se guarda en la carpeta **`data`** dentro del proyecto (se crea sola): la base de datos, la contraseña de la cuenta de ejemplo y los correos de prueba.

- **Empezar de cero:** cierra la app y borra la carpeta `data`. Al abrirla de nuevo se vuelve a crear con el negocio de ejemplo.
- **No abras dos copias a la vez** sobre la misma carpeta. La app lo impide y te avisa.

### Copia de seguridad

En **Administración → Ajustes → Copia de seguridad**, el botón **Descargar copia de seguridad** baja un solo archivo (`comanda-copia-fecha.json.gz`) con todo: comercios, menús, fotos, pedidos, pagos y ajustes. Guárdalo fuera del computador o del servidor: en una memoria USB o en la nube.

Ese archivo contiene los datos de los clientes de todos los comercios. Las contraseñas no van escritas (solo una huella que no permite leerlas), pero trátalo igual como información privada.

**Restaurar** una copia reemplaza todo lo que hay por lo que trae el archivo:

- Desde **Ajustes → Restaurar una copia**: eliges el archivo y escribes la palabra RESTAURAR. En tu computador, antes de reemplazar, la app guarda sola una copia de lo que había en `data/copias`.
- Desde la consola (útil con copias muy grandes):

  ```bash
  npm run copia                                   # guarda una copia en la carpeta "copias"
  npm run restaurar -- copias/nombre-del-archivo.json.gz
  ```

  Con la base local, cierra antes la app. Si en `.env.local` está `DATABASE_URL`, estos comandos trabajan sobre esa base en la nube.

La misma copia sirve para **mudarte**: una copia hecha en tu computador se puede restaurar en la app publicada en internet, y al revés. Ten en cuenta que al restaurar quedan las cuentas que trae la copia: asegúrate de que tu correo de administrador exista en ella.

### Actualizar desde una versión anterior

1. Cierra la app.
2. Descomprime la versión nueva en una carpeta **nueva**.
3. Copia la carpeta `data` de la versión anterior dentro de la nueva.
4. Abre `iniciar.bat`. La base de datos se actualiza sola y no se pierde nada.

También sirve, con la app cerrada, copiar los archivos nuevos encima de la carpeta anterior (reemplazando los que ya existen): al abrir `iniciar.bat`, instala lo que falte y prepara la app de nuevo.

Qué vas a notar al actualizar:

- **La cuenta de ejemplo cambia de contraseña.** La ventana de inicio muestra la nueva y avisa que `demo1234` ya no sirve.
- Tus comercios quedan **sin plan y sin fecha de vencimiento**: nada se bloquea hasta que tú lo configures.
- Tus productos quedan sin opciones, y tu costo fijo de domicilio sigue igual.
- Los datos de ejemplo nuevos (opciones, zonas, cupón, planes) solo se crean en una base que empieza de cero.

---

## 7. Publicarla en internet

En internet la app necesita una base de datos PostgreSQL. Se le indica con una sola variable, `DATABASE_URL`; las tablas se crean solas en el primer arranque.

> Estas instrucciones siguen la documentación de Vercel y Supabase. La app se probó contra un PostgreSQL real, pero **no** se probó con cuentas reales de Vercel ni de Supabase.

### Opción A: Vercel + Supabase

Sirve para probar sin pagar. El plan gratuito de Vercel (Hobby) es solo para uso personal y no comercial: para cobrarle a negocios necesitas su plan Pro u otro servidor (opción B).

1. **Base de datos.** Crea una cuenta en <https://supabase.com> y un proyecto nuevo. Usa una contraseña de base de datos solo con letras y números.
2. En el proyecto, pulsa **Connect** (arriba) y copia la cadena del **pooler en modo transacción** (*Transaction pooler*): es la que termina en `:6543/postgres`. Reemplaza `[YOUR-PASSWORD]` por tu contraseña.
3. **Publicar.** Crea una cuenta en <https://vercel.com>. En la carpeta del proyecto, abre una terminal y escribe:

   ```bash
   npx vercel link
   npx vercel env add DATABASE_URL production
   npx vercel deploy --prod
   ```

   El primer comando te pide iniciar sesión y crea el proyecto. El segundo te pide pegar la cadena del paso 2. El tercero publica y te muestra la dirección.
4. Abre la dirección, entra a `/registro` y crea tu negocio.
5. Para administrar el servicio, añade tu correo como administrador y vuelve a publicar (el porqué de este orden está en la sección 4):

   ```bash
   npx vercel env add ADMIN_EMAILS production
   npx vercel deploy --prod
   ```

Si ves un error al abrirla, casi siempre es la cadena de conexión: revisa la contraseña y que sea la del puerto 6543.

En Vercel no se pueden guardar archivos, así que no hay carpeta `data`: la copia de seguridad se descarga con el botón, y la cuenta de ejemplo (si la creas con `SEED_DEMO=1`) queda sin contraseña.

### Opción B: un servidor propio (VPS)

En un servidor con Node.js 20.9 o más reciente:

```bash
npm install
npm run build
npm start          # escucha en el puerto 3000; cámbialo con PORT=8080 npm start
```

Sin `DATABASE_URL` usa la base local de la carpeta `data`, que en un servidor con disco propio funciona bien para empezar. Pon delante un proxy con HTTPS (Caddy o Nginx) que reenvíe las cabeceras `Host`, `X-Forwarded-Proto` y `X-Forwarded-For`: con HTTPS, la cookie de sesión solo viaja cifrada, y con la dirección de cada visitante los límites contra abusos se aplican por persona.

### Antes de abrirla al público

- **Define `ADMIN_EMAILS`** con tu propia cuenta (sección 4). Con la base local, mientras no lo hagas, la administradora es la cuenta de ejemplo, cuya contraseña está en `data/cuenta-de-ejemplo.txt` en el servidor.
- **Define `APP_URL`** con tu dirección pública, sobre todo en un servidor propio: con ella se arman el enlace y el QR de cada menú, el enlace de seguimiento y el del correo.
- Decide si dejas el **registro abierto** o lo cierras con `ALLOW_SIGNUP=false` y creas tú los comercios.
- Revisa el **aviso de tratamiento de datos** con un abogado (sección 3).
- Descarga una **copia de seguridad** cada cierto tiempo.

### Variables de entorno

Se escriben en un archivo `.env.local` (hay una plantilla en `.env.example`) o en el panel de tu servidor.

| Variable | Para qué sirve |
| --- | --- |
| `DATABASE_URL` | Conexión a PostgreSQL. Si no está, se usa la base local de la carpeta `data`. |
| `APP_URL` | Dirección pública (por ejemplo `https://menu.tudominio.com`). Se usa en los enlaces, el QR y los correos. Si no está, se toma la del navegador, salvo para los correos. |
| `ADMIN_EMAILS` | Correos que pueden entrar a `/admin`, separados por comas. Añádelos **después** de registrar esas cuentas (sección 4). |
| `ALLOW_SIGNUP` | Pon `false` para que nadie más pueda registrarse. Los comercios nuevos se crean entonces desde `/admin`. |
| `SMTP_URL` | Servicio de correo para recuperar contraseñas (sección 5). Con `smtp://` se exige conexión cifrada. |
| `EMAIL_FROM` | Remitente de los correos, por ejemplo `Mi Servicio <avisos@tudominio.com>`. |
| `SEED_DEMO` | `1` crea el negocio de ejemplo también en la base en la nube (sin contraseña para entrar). `0` no lo crea ni en local. |
| `DATABASE_SSL` | `verify` exige un certificado válido; `off` desactiva el cifrado. Por defecto se cifra con servidores remotos. |
| `DATA_DIR` | Otra carpeta para la base local. |
| `TRUSTED_PROXIES` | Solo si hay más de un proxy delante de la app (por ejemplo, Cloudflare y además Nginx): cuántos son. Por defecto, 1. |

---

## 8. Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run iniciar` | Lo mismo que `iniciar.bat`: instala, prepara y abre la app. |
| `npm run dev` | Modo desarrollo: los cambios en el código se ven al guardar. |
| `npm run build` y `npm start` | Preparar y arrancar en un servidor. |
| `npm test` | Pruebas automáticas: precios, opciones, cupones, totales, mensajes de WhatsApp, fechas y zonas horarias, horarios, planes y vencimientos, reportes y el archivo de Excel. |
| `npm run clave -- correo@negocio.com NuevaClave123` | Cambia la contraseña de una cuenta (cierra antes la app si usas la base local). |
| `npm run copia` | Guarda una copia de seguridad en la carpeta `copias`. |
| `npm run restaurar -- archivo.json.gz` | Restaura una copia. Reemplaza todo lo que hay; pide confirmación. |

---

## 9. Mapa del proyecto

```
src/
  app/                    Páginas (cada carpeta es una dirección)
    page.tsx                Portada
    entrar/  registro/      Inicio de sesión y registro
    recuperar/  restablecer/  Recuperar la contraseña por correo
    m/[slug]/               Menú público de cada negocio (y su aviso de datos)
    p/[token]/              Seguimiento del pedido para el cliente
    panel/                  Panel del negocio
      pedidos/                Lista, detalle (comanda), aviso de pedidos nuevos y Excel
      reportes/  clientes/    Ventas, ganancias, visitas y clientes
      menu/                   Categorías, productos y sus opciones
      perfil/ entregas/ horarios/ publicidad/ cupones/   Apartados de "Tienda"
    admin/                  Administración del servicio
      comercios/  pedidos/    Comercios y pedidos de todos
      planes/  pagos/         Planes y cobro
      ajustes/  copia/        Ajustes y copia de seguridad
    img/[id]/               Sirve las fotos guardadas
    globals.css             Colores, tipografías y estilos base
  components/
    menu/                   Vista del cliente: catálogo, ficha del producto, carrusel, carrito
    panel/                  Formularios y piezas del panel
    admin/                  Formularios de la administración
    ui/                     Piezas compartidas (botones, iconos…)
    secret/                 Los juegos escondidos (ver "Un detalle escondido")
  lib/
    config.ts               Nombre de la app, monedas, países, límites
    orders.ts               Estados, formas de entrega y cálculo de totales
    orders-data.ts          Guardar y consultar pedidos, clientes y reportes
    options.ts              Opciones de producto (tamaños, adicionales)
    coupons.ts              Reglas de los cupones
    billing.ts  plans-data.ts   Planes, vencimientos y pagos
    settings.ts             Ajustes del servicio
    privacy.ts              Plantilla del aviso de tratamiento de datos
    email.ts  password-reset.ts   Correos y enlaces para cambiar la contraseña
    backup.ts               Copia de seguridad: guardar y restaurar
    demo-account.ts         Contraseña de la cuenta de ejemplo
    whatsapp.ts             Arma el mensaje del pedido y el enlace de WhatsApp
    hours.ts                Abierto o cerrado según el horario
    banners.ts              Espacios de publicidad y sus tamaños
    excel.ts  export.ts     El archivo de Excel
    reports.ts  filters.ts  Cuentas de los reportes y filtros por fecha
    dates.ts                Fechas en la zona horaria de cada negocio
    money.ts                Formato y lectura de precios
    admin.ts  admin-data.ts Quién administra el servicio y sus consultas
    schema.ts               Tablas de la base de datos
    db.ts                   Conexión: base local o PostgreSQL
    data.ts                 Consultas (negocios, categorías, productos, zonas, fotos, publicidad)
    auth.ts  password.ts    Sesiones y contraseñas
    actions/                Lo que pasa al enviar cada formulario
    demo-menu.ts  seed.ts   Negocio de ejemplo: su contenido y cómo se crea
    blocks.ts               Reglas del juego escondido
seed/img/                 Imágenes del negocio de ejemplo
scripts/                  Arranque, cambio de contraseña, copia y restauración
tests/                    Pruebas automáticas
```

**Tecnología:** Next.js 16 (React 19) con TypeScript, Tailwind CSS 4 y PostgreSQL. En local, PostgreSQL corre dentro de la propia app gracias a PGlite. El Excel se genera con ExcelJS y los correos se envían con Nodemailer.

---

## 10. Personalizar

- **Nombre y textos de marca:** `src/lib/config.ts` (`APP_NAME`, `APP_TAGLINE`, `FOOTER_CREDIT`).
- **Colores:** las variables al inicio de `src/app/globals.css`. Hay un juego para tema claro y otro para oscuro.
- **Monedas y países:** listas `CURRENCIES` y `COUNTRY_CODES` en `src/lib/config.ts`.
- **Texto del pedido:** función `buildOrderMessage` en `src/lib/whatsapp.ts`.
- **Aviso de tratamiento de datos:** en **Administración → Ajustes**; la plantilla de partida está en `src/lib/privacy.ts`.
- **Sonido del aviso de pedidos:** `src/components/panel/chime.ts`.
- **Tamaños y cantidad de imágenes de publicidad:** `src/lib/banners.ts`.
- **Negocio de ejemplo:** `src/lib/demo-menu.ts` y las imágenes de `seed/img`. Los cambios se ven al empezar con una base de datos nueva.

### Un detalle escondido

La app guarda una sorpresa: **"Dos Lunas"**, trece juegos en pixel art hechos como homenaje a `@nathabermudez03`.

- **Cómo se abre:** toca **cinco veces seguidas** el texto del pie de página (`sotomontessebas · soporte técnico`; en el menú de un negocio, `Menú hecho con Comanda`; en el seguimiento de un pedido, `Hecho con Comanda`). No tiene dirección propia ni se nota en la página, y solo se descarga cuando alguien lo abre.
- **Los juegos** (botón **Jugar** de la portada):
  - **Torre de Luna:** bloques que caen. Al completar 10 líneas aparece el mensaje (es la única forma de leerlo).
  - **Laberinto Lunar:** Natha, la ninja, recoge luces mientras la siguen tres espíritus; con una flor de cerezo los espíritus se asustan.
  - **Lluvia de Espíritus:** Natha lanza estrellas a los espíritus que bajan; cada oleada tiene la forma de una letra de su nombre.
  - **Duelo de Lunas:** dos faroles se pasan una luna. Contra la máquina o dos personas en el mismo aparato (cada una toca su mitad de la pantalla, o ← → y A D en el teclado).
  - **Carrera por los Tejados:** Natha corre sola por los tejados; hay que saltar huecos y faroles.
  - **Muro de Faroles:** una luz rompe muros de faroles con la forma de cada letra de NATHALIA.
  - **Dragón de Papel:** un dragón de festival crece con cada flor que come.
  - **Parejas de Espíritus:** memoria, en tres rondas.
  - **Fichas del Templo:** fichas apiladas que se quitan por parejas iguales (siempre tiene solución).
  - **Ruta de los Faroles:** carreras de autos vistas desde atrás, con curvas, lomas y rivales; cada arco de faroles da más tiempo y cambia el paisaje.
  - **Pinball de las Lunas:** una mesa dibujada con el doble de detalle (rieles de madera y metal, plásticos con dibujos, luces con halo, bola metálica, pantalla de puntos animada) y un fondo distinto en cada paisaje. Tiene cuatro rampas en la misma mesa (de plástico y de alambre, que se cruzan por encima y se pueden fallar), un rulo, órbitas, objetivos que caen, bola cautiva, imán, disco giratorio tramposo, una luna con cara que se traga la bola, una muralla que sube y baja, 14 misiones, 9 rangos, dos pisos superiores, multibola con jackpots, y empujón con FALTA si se abusa.
  - **Cadena de Lunas:** una cadena de esferas de colores avanza por un camino hacia un pozo; un ídolo de piedra con forma de luna lanza esferas para juntar tres o más del mismo color. Tiene imán y combos, esferas especiales (retroceso, lentitud, puntería, bomba), monedas, y 24 niveles con caminos distintos (espirales, puentes, cuevas y niveles con dos caminos).
  - **Casa de Patitas:** cuidar gatitos y perritos (alimentarlos, jugar con ellos, bañarlos, dormirlos, acariciarlos y curarlos). Crecen, ganan accesorios y se guardan en el navegador. Cada vez que se juega aparece el mensaje **"Ayuda a un animalito"** con una fundación real que rescata animales en Colombia.
- **Paisajes:** seis, que van cambiando a medida que se avanza: la aldea, el santuario, el bosque de bambú, el lago de los faroles, la cumbre nevada y el cuarto del jacuzzi. En el panel se puede elegir cuáles salen y en qué orden.
- **Lista de juegos:** cada juego tiene una miniatura para reconocerlo.
- **Cómo se juega:** con las flechas y la barra espaciadora en el computador, o con los botones y toques en la pantalla del celular. `P` pausa.
- **Puntajes:** al terminar una partida se puede firmar con un nombre de hasta 8 letras. Los diez mejores de cada juego se guardan en la base de datos de la app (tabla `game_scores`), así que todos ven la misma tabla. Si no hay conexión, se usa una tabla guardada en ese dispositivo. Para vaciarla: `delete from game_scores;`. Los puntajes no van en la copia de seguridad.
- **Panel de diseño (Administración → Juegos):** ahí cambias, sin tocar código, los textos de la portada y del mensaje, el **nombre que se junta letra por letra** (en lugar de NATHALIA, cualquier nombre de 3 a 10 letras), el nombre corto, los mensajes secretos con su trofeo, el **secreto final** (texto del botón, título, escenas y cierre), los **paisajes** que salen, las **fundaciones** de "Ayuda a un animalito" y los **personajes**. Para cada personaje sale la medida que debe tener su dibujo (por ejemplo, la protagonista grande 12 × 12 píxeles y la pequeña 8 × 8): puedes subir una imagen (PNG, JPG, GIF o WEBP) y el convertidor la ajusta a esa medida, le quita el fondo, reduce los colores y le pone contorno; luego la retocas píxel a píxel en el editor. Con **Probar** ves el juego con los cambios antes de guardarlos. Se guarda en la base de datos (tabla `settings`, clave `game_theme`, que también va en la copia de seguridad) y lo ve todo el que abra los juegos.
- **Logros:** cada mensaje secreto es un logro con trofeo de bronce, plata u oro (10, 25 o 50 puntos). Al desbloquear uno aparece abajo el aviso "Logro desbloqueado". En la portada, el botón **Logros** muestra los conseguidos, los puntos y una pista de cada uno que falta.
- **Consola y códigos:** en la portada, **Consola** abre una pantalla de terminal donde se escriben códigos. Tú los inventas en Administración → Juegos → **Códigos** (código, título y anuncio, activo o apagado, y cuántas veces se usó); quien escribe uno válido ve su anuncio y queda guardado para releerlo. Los códigos no son públicos: el servidor solo dice si uno escrito existe, y limita los intentos. La consola también entiende `AYUDA`, `CODIGOS`, `GUARDAR` y `CARGAR` (el progreso del jugador en un archivo), `LIMPIAR` y `SALIR`.
- **Secreto final:** con todos los logros aparece en la portada el botón **Secreto final**, que abre una cinemática de casi dos minutos (las dos lunas, una escena por paisaje, el nombre en grande rodeado de trofeos, el mensaje de cierre y los créditos). Escribir el nombre corto con el teclado en la portada hace aparecer el botón sin esperar a tener todos los logros.
- **Mensajes secretos:** hay 16, escondidos dentro del juego. Cuando se descubre el primero aparece en la portada el botón **Mensajes secretos**, con los encontrados y una pista de cada uno que falta. Se descubren así:
  - tocando 5 veces seguidas el nombre grande "DOS LUNAS" de la portada;
  - guardando un puntaje con el nombre o el nombre corto (NATHALIA o NATHA, si no los cambias);
  - escribiendo el nombre corto con el teclado en la portada;
  - completando 25 líneas en Torre de Luna;
  - y uno por cada juego nuevo: juntar el nombre (laberinto, lluvia, tejados, dragón, carreras), romper todas las letras del muro, encender todas las letras del pinball, ganarle un duelo a la máquina, completar las tres rondas de parejas, despejar un tablero de fichas, completar el nivel 10 de Cadena de Lunas y dejar muy felices a un gatito y a un perrito.
- **Textos de siempre:** si nunca cambias nada en el panel, se usan los de `src/components/secret/texts.ts`. En pantalla salen en mayúsculas porque las letras de píxeles no tienen minúsculas.
- **Dónde está cada cosa:** los juegos nuevos en `src/components/secret/games/` (uno por archivo), los paisajes en `src/components/secret/worlds*.ts`.
- **Cambiar cuántos toques lo abren:** `TAPS` en `src/components/secret/SecretTap.tsx`.
- **Quitarlo:** borra las tres apariciones de `<SecretTap>` (en `src/components/ui/SiteChrome.tsx`, `src/components/menu/MenuView.tsx` y `src/app/p/[token]/page.tsx`), dejando el texto que envuelven.

Los dibujos, las letras, los personajes y los sonidos están hechos desde cero para estos juegos: no usan imágenes ni marcas de nadie más.
- **Fundaciones de fábrica** (de prensa colombiana; conviene confirmarlas con cada una antes de difundirlas): Peluditos con Futuro (Bogotá, @peluditos_colombia), Second Chances (Bogotá, @secondchances_15), Fundación Dannvalent Dog (Guatavita, @dannvalentdog), Fundación Por Amor a Rocky (Medellín, @poramorarocky1), Albergue Pataclau (Cali, @alberguepataclau) y la Unidad de Protección Animal de Manizales (Secretaría de Medio Ambiente). Se cambian en el panel.

---

### En un NAS Synology o cualquier servidor con Docker

El proyecto trae `Dockerfile` y `docker-compose.yml`. La guía paso a paso para Synology (Container Manager, túnel de Cloudflare, copias) está en [`docs/synology.md`](docs/synology.md). En resumen: copia la carpeta al servidor, crea dentro las carpetas `data` y `copias`, ajusta `APP_URL` y `ADMIN_EMAILS` en `docker-compose.yml`, y ejecuta `docker compose up -d --build`. La app queda en el puerto 3000.

**Copias automáticas:** mientras la app está encendida en un servidor propio, guarda sola una copia completa cada 24 horas en `copias/automaticas` y conserva las 14 más recientes. Se ajusta con `COPIAS_CADA_HORAS`, `COPIAS_GUARDAR`, `COPIAS_CARPETA`, y se apaga con `COPIAS_AUTOMATICAS=0`.

---

## 11. Lo que falta

La app funciona de punta a punta, pero todavía no hace todo lo que ofrecen servicios como PediFácil. Pendientes, del más útil al menos urgente:

**Se puede programar sin depender de terceros**

- **Actualizar precios subiendo un Excel.**
- **Subcategorías** y **precios por mayor** o listas de precios por cliente.
- **Sucursales**: varios locales de un mismo negocio.
- **Menús privados** con código de acceso.
- **Subdominio por negocio** (`negocio.tudominio.com`). Hoy cada menú vive en `/m/negocio`.
- **Eliminar la propia cuenta** desde el panel y términos de uso.
- **Aviso de pedido con la pantalla apagada**: convertir el panel en una app instalable con notificaciones.

**Necesitan una cuenta en un servicio externo (algunos son de pago)**

- **Cobro automático de los planes** con tarjeta o PSE: una pasarela de pagos. Hoy los pagos se registran a mano.
- **Pagos en línea de los pedidos**: una pasarela de pagos. Hoy solo se pregunta la forma de pago preferida.
- **Aviso de pedido por correo**: usa el mismo servicio de correo de la sección 5; falta programarlo.
- **Domicilio según la distancia** (ubicación GPS y costo por kilómetro): un servicio de mapas. Hoy el domicilio es fijo o por zonas.
- **Recibir el pedido directo en WhatsApp sin que el cliente toque enviar**, o respuestas automáticas: la API oficial de WhatsApp Business. Meta cobra los mensajes que envía el negocio y exige verificarlo; confirma los precios vigentes en su página antes de decidir.

**No son programación**

- Soporte, tiempos de implementación y servidores: dependen de cómo prestes tú el servicio y de dónde lo publiques.
- La revisión legal del aviso de datos y de tus condiciones de servicio.

**Límites técnicos a tener en cuenta**

- Las fotos se guardan en la base de datos. Alcanza para empezar; con muchos comercios conviene pasarlas a un almacenamiento de archivos.
- El límite de intentos (de inicio de sesión, de pedidos y de cupones) vive en la memoria de cada servidor.
- El conteo de visitas es simple: suma cada vez que se abre el menú, sin distinguir personas.
- El aviso con sonido consulta cada 20 segundos mientras el panel está abierto.

---

## 12. Problemas frecuentes

| Problema | Solución |
| --- | --- |
| "No se encontró Node.js" | Instala la versión LTS desde <https://nodejs.org> y vuelve a abrir `iniciar.bat`. |
| No sé la contraseña de la cuenta de ejemplo | Está en la ventana de inicio y en el archivo `data/cuenta-de-ejemplo.txt`. La de versiones anteriores (`demo1234`) ya no sirve. |
| "La base de datos local ya está en uso" | Hay otra ventana de la app abierta: ciérrala. Si no hay ninguna, espera medio minuto y vuelve a intentar. |
| El celular no abre la dirección | Revisa que esté en la misma wifi y que el firewall permita a Node.js en redes privadas. |
| Cambié el código y no se ve | `iniciar.bat` prepara la app de nuevo cuando detecta cambios. Para trabajar en el código es más cómodo `npm run dev`. |
| Un comercio olvidó la contraseña | Si conectaste el correo, usa **¿Olvidaste tu contraseña?**. Si no, cámbiala en `/admin`, en la ficha del comercio, o con `npm run clave -- su@correo.com NuevaClave123`. |
| El aviso no suena | Actívalo en **Pedidos** en ese dispositivo, pulsa **Probar sonido** y revisa el volumen. El panel debe estar abierto; con la pantalla apagada no suena. |
| El menú de un comercio dice que no está disponible | Está suspendido o su plan venció. Revisa su ficha en `/admin` y registra el pago o cambia su fecha. |
| Un pedido aparece en el panel pero no llegó por WhatsApp | El cliente no tocó enviar en WhatsApp. El pedido tiene su teléfono: ábrelo y usa **Escribirle por WhatsApp**. |
| Al cliente no se le abre WhatsApp | Algunos navegadores bloquean la pestaña nueva. La pantalla "Pedido registrado" tiene el botón **Abrir WhatsApp** y la opción de copiar el pedido. |
| No llegan los correos | En **Administración → Ajustes → Correo** pulsa **Enviar un correo de prueba**: el mensaje dice qué falló. Revisa `SMTP_URL`, `EMAIL_FROM` y `APP_URL` (sección 5), y la carpeta de correo no deseado. |
| La hora de los pedidos sale corrida | Revisa la **zona horaria** en **Tienda → Datos**. |
| No veo "Administración" | En internet, tu correo debe estar en `ADMIN_EMAILS` (sección 4). En tu computador la tiene la cuenta de ejemplo. |
| Restauré una copia y no puedo entrar | Quedaron las cuentas de la copia. Entra con una de ellas, o cambia una contraseña con `npm run clave`. |
| El puerto 3000 está ocupado | La app usa el siguiente libre y lo muestra en la ventana. |
| La base local da errores en tu computador | Usa una base en la nube: crea el archivo `.env.local` con `DATABASE_URL` (sección 7, pasos 1 y 2) y vuelve a abrir la app. |

---

## Un homenaje escondido: «Dos Lunas»

Dentro de Comanda hay un pequeño secreto. Si tocas **cinco veces seguidas** el texto del pie de página ("… · soporte técnico"), se abre **«Dos Lunas»**: una consola retro con una colección de minijuegos de pixel-art hechos a mano —Torre de Luna, Laberinto Lunar, Lluvia de Espíritus, Duelo de Lunas, Carrera por los Tejados, Muro de Faroles, Dragón de Papel, Parejas de Espíritus, Fichas del Templo, pinball y más—, con su propio motor de render, puntajes y una consola de códigos.

Es un homenaje dedicado a **@nathabermudez03**. Todos sus textos, nombres, logros, personajes y paisajes se pueden editar desde **Administración → Juegos**.

<table>
  <tr>
    <td width="50%"><img src="docs/images/dos-lunas.png" alt="Portada Dos Lunas"><br><sub>La portada de «Dos Lunas»</sub></td>
    <td width="50%"><img src="docs/images/juegos.png" alt="Galería de juegos"><br><sub>La galería de minijuegos</sub></td>
  </tr>
</table>

### Casa de Patitas 🐾 — adopta, no compres

Uno de los juegos es **Casa de Patitas**, una mascota virtual donde cuidas gatitos y perritos. Cada cierto tiempo aparece una tarjeta con una **fundación real que rescata animales**, con el mensaje "Ayuda a un animalito". La lista que viene de fábrica (editable en Administración → Juegos) incluye fundaciones de varias ciudades de Colombia:

- **Peluditos con Futuro** — Bogotá
- **Second Chances** — Bogotá
- **Fundación Dannvalent Dog** — Guatavita, Cundinamarca
- **Fundación Por Amor a Rocky** — Medellín
- **Albergue Pataclau** — Cali
- **Unidad de Protección Animal (UPA)** — Manizales

> Si vas a adoptar, confirma siempre los datos de contacto de cada fundación: cambian con el tiempo.

---

## Créditos

Desarrollado por **Sebastian Sotomontes**. Proyecto **gratis y de código abierto**, inspirado por **@nathabermudez03**.
