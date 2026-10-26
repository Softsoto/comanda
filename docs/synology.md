# Comanda en un NAS Synology

Comanda corre en el NAS como un contenedor de Docker con el paquete **Container Manager**. Los datos y las copias quedan en carpetas normales del NAS.

## Qué necesitas

- NAS Synology con **DSM 7.2 o más nuevo** y **Container Manager** (Centro de paquetes).
- 2 GB de RAM para usarla; 4 GB recomendados para prepararla la primera vez.
- Este proyecto (`comanda.zip`) y la IP del NAS en tu red.

## 1. Preparar la carpeta

1. File Station → carpeta compartida **docker** → sube `comanda.zip` y **Extraer aquí**. Debe quedar `docker/comanda` con `Dockerfile` y `docker-compose.yml`.
2. Crea dentro dos carpetas vacías: `data` y `copias`.
3. Edita `docker-compose.yml`: `APP_URL` (dirección pública), `ADMIN_EMAILS` (tu correo, después de registrarte), `TZ`. Si el puerto 3000 está ocupado: `"3001:3000"`.

## 2. Crear el proyecto

Container Manager → **Proyecto** → **Crear** → nombre `comanda`, ruta `docker/comanda`, usar el `docker-compose.yml` existente → **Listo**. Espera a que el **Registro** del contenedor diga `Ready` y abre `http://IP-DEL-NAS:3000`.

Si el asistente no compila, por SSH (Panel de control → Terminal y SNMP → activar SSH):

```bash
cd /volume1/docker/comanda
sudo docker compose up -d --build
sudo docker compose logs -f comanda
```

## 3. Primer uso

Regístrate, pon tu correo en `ADMIN_EMAILS`, **Detener** y **Construir** el proyecto. La contraseña de la cuenta de ejemplo está en `data/cuenta-de-ejemplo.txt`.

## 4. Publicarla en internet

- **Túnel de Cloudflare con dominio (recomendado):** Zero Trust → Networks → Tunnels → Create → Cloudflared → Docker → copia el token. En `docker-compose.yml` quita los `#` del bloque `tunel` y pega el token. En el túnel, Public Hostname → `menu.tudominio.com` → HTTP → `comanda:3000`. Pon `APP_URL=https://menu.tudominio.com` y vuelve a construir.
- **Túnel rápido sin dominio:** en el bloque `tunel`, sin token, usa `command: tunnel --no-autoupdate --url http://comanda:3000`. La dirección `*.trycloudflare.com` sale en el Registro de `comanda-tunel` y cambia al reiniciar.
- **DDNS de Synology:** solo si tu operador deja abrir puertos: DDNS `*.synology.me` con Let's Encrypt, Proxy inverso 443 → `localhost:3000`, y reenviar el puerto 443 del router al NAS.

## Copias de seguridad

- **Automáticas:** cada 24 h en `docker/comanda/copias/automaticas`, se guardan las 14 más recientes (`COPIAS_CADA_HORAS`, `COPIAS_GUARDAR`). Incluyen todo: comercios, pedidos, fotos, ajustes, personalización de los juegos, códigos y puntajes.
- **Manual:** Administración → Ajustes → Descargar copia de seguridad.
- **Fuera del NAS:** con **Hyper Backup**, copia `docker/comanda/copias` a un USB o a la nube cada semana.
- **Progreso de cada jugador:** en el juego, Consola → `GUARDAR` (o Logros → Guardar mi progreso).

## Actualizar

Descarga una copia, **Detener**, guarda tu `docker-compose.yml`, borra todo menos `data`, `copias` y `docker-compose.yml`, extrae el zip nuevo, vuelve a poner tu `docker-compose.yml` y **Construir**.
