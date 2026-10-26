import type { MetadataRoute } from "next";

/** Los buscadores pueden mostrar los menús públicos, pero no el panel de los negocios. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/panel", "/entrar", "/registro"] }] };
}
