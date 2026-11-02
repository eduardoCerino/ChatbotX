import type { ShopifyBlogKeyword } from "./keywords"

export const SHOPIFY_BLOG_SYSTEM_PROMPT = `Eres un redactor SEO especializado en salud femenina y suplementos para el mercado mexicano.
Escribes en español de México, con un tono cálido, claro y cercano, dirigido a mujeres entre 20 y 40 años.
Nunca uses lenguaje médico excesivamente técnico.
No inventes estudios ni estadísticas que no puedas verificar — si mencionas datos, hazlo de forma general (“algunos estudios sugieren...”).`

export const LEGAL_DISCLAIMER =
  "Este producto es un suplemento alimenticio. No previene, diagnostica, trata ni cura ninguna enfermedad."

export const buildShopifyBlogUserPrompt = (input: {
  entry: ShopifyBlogKeyword
  productUrl?: string
}): string => {
  const { entry, productUrl } = input
  const ctaUrlLine = productUrl
    ? `Incluye un enlace natural a este producto en el CTA: ${productUrl}`
    : "Menciona el producto por su nombre en el CTA (sin URL específica)."

  return `Escribe un artículo de blog SEO con estos datos:

- Keyword objetivo: ${entry.keyword}
- Tema / ángulo: ${entry.topic}
- Producto relacionado: ${entry.product}

Requisitos:
- Español de México, tono cálido y cercano, dirigido a mujeres.
- Entre 800 y 1,200 palabras.
- Incluye un H1, varios H2 y párrafos naturales en HTML (usa <h1>, <h2>, <p>; sin <html> ni <body>).
- La keyword debe aparecer en el H1, en el primer párrafo y en al menos un H2.
- Optimizado para SEO sin keyword stuffing.
- Al final, antes del aviso legal, incluye un CTA natural (no agresivo) hacia el producto ${entry.product}. ${ctaUrlLine}
- Termina el bodyHtml con este aviso legal exacto en un párrafo: "${LEGAL_DISCLAIMER}"

Responde ÚNICAMENTE con un JSON válido (sin markdown) con esta forma:
{
  "title": "título del artículo (puede coincidir con el H1)",
  "bodyHtml": "HTML del cuerpo completo incluyendo H1",
  "titleTag": "title tag SEO, máximo 60 caracteres",
  "metaDescription": "meta description SEO, máximo 155 caracteres",
  "handle": "slug-url-amigable-en-minusculas"
}`
}
