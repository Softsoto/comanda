import { createHash } from "node:crypto";
import type { NextConfig } from "next";

/** Marca de esta instalación: una huella corta de la carpeta desde la que corre (ver scripts/iniciar.mjs). */
const folderMark = createHash("sha1").update(process.cwd()).digest("hex").slice(0, 12);

const nextConfig: NextConfig = {
  // La base de datos local (PGlite), el conector de Postgres, el generador de
  // archivos de Excel y el envío de correos se cargan tal cual desde
  // node_modules; no se empaquetan con el resto del servidor.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "exceljs", "nodemailer"],

  experimental: {
    serverActions: {
      // Las fotos se reducen en el navegador antes de subirlas, así que 3 MB sobra.
      bodySizeLimit: "3mb",
    },
  },

  // Las imágenes del menú de ejemplo se leen del disco al crear los datos de prueba.
  outputFileTracingIncludes: {
    "/**": ["./seed/**"],
  },

  // Permite abrir el modo desarrollo desde otro dispositivo de la misma red wifi.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],

  devIndicators: false,
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Permite al script de inicio reconocer si la app ya está abierta desde esta misma carpeta.
          { key: "X-Comanda", value: folderMark },
        ],
      },
    ];
  },
};

export default nextConfig;
