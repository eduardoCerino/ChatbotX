import type { GeneratedShopifyBlogArticle } from "./openai"

const PROTOCOL_RE = /^https?:\/\//
const TRAILING_SLASH_RE = /\/$/

export type ShopifyBlogClientConfig = {
  storeDomain: string
  accessToken: string
  apiVersion: string
  blogId?: string
  author?: string
  fetchImpl?: typeof fetch
}

type ShopifyArticle = {
  id: number
  handle: string
  title: string
}

const shopifyAdminUrl = (
  config: ShopifyBlogClientConfig,
  path: string,
): string => {
  const domain = config.storeDomain
    .replace(PROTOCOL_RE, "")
    .replace(TRAILING_SLASH_RE, "")
  return `https://${domain}/admin/api/${config.apiVersion}${path}`
}

const shopifyFetch = async <T>(
  config: ShopifyBlogClientConfig,
  path: string,
  init?: RequestInit,
): Promise<T> => {
  const fetchImpl = config.fetchImpl ?? fetch
  const response = await fetchImpl(shopifyAdminUrl(config, path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": config.accessToken,
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(
      `Shopify Admin API ${path} failed (${response.status}): ${body.slice(0, 500)}`,
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

/**
 * Returns the Admin API token for this run. A legacy custom app has a static
 * `shpat_` token; a Dev Dashboard app (the only kind creatable since 2026)
 * exchanges its client ID and secret for a 24-hour token via the client
 * credentials grant, so a fresh one is requested on every run.
 */
export const resolveShopifyAccessToken = async (input: {
  storeDomain: string
  accessToken?: string
  clientId?: string
  clientSecret?: string
  fetchImpl?: typeof fetch
}): Promise<string> => {
  if (input.accessToken) {
    return input.accessToken
  }
  if (!(input.clientId && input.clientSecret)) {
    throw new Error("Shopify credentials missing")
  }

  const fetchImpl = input.fetchImpl ?? fetch
  const domain = input.storeDomain
    .replace(PROTOCOL_RE, "")
    .replace(TRAILING_SLASH_RE, "")
  const response = await fetchImpl(
    `https://${domain}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: input.clientId,
        client_secret: input.clientSecret,
      }),
    },
  )

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(
      `Shopify token request failed (${response.status}): ${body.slice(0, 500)}`,
    )
  }

  const json = (await response.json()) as { access_token?: string }
  if (!json.access_token) {
    throw new Error("Shopify token response has no access_token")
  }
  return json.access_token
}

export const resolveShopifyBlogId = async (
  config: ShopifyBlogClientConfig,
): Promise<string> => {
  if (config.blogId) {
    return config.blogId
  }

  const data = await shopifyFetch<{ blogs: Array<{ id: number }> }>(
    config,
    "/blogs.json",
  )
  const first = data.blogs[0]
  if (!first) {
    throw new Error("Shopify store has no blogs")
  }
  return String(first.id)
}

export const findShopifyArticleByHandle = async (
  config: ShopifyBlogClientConfig,
  blogId: string,
  handle: string,
): Promise<ShopifyArticle | undefined> => {
  const data = await shopifyFetch<{ articles: ShopifyArticle[] }>(
    config,
    `/blogs/${blogId}/articles.json?handle=${encodeURIComponent(handle)}&limit=1`,
  )
  return data.articles.find((article) => article.handle === handle)
}

export const createShopifyBlogArticle = async (input: {
  config: ShopifyBlogClientConfig
  blogId: string
  article: GeneratedShopifyBlogArticle
  tags: string[]
}): Promise<ShopifyArticle> => {
  const { config, blogId, article, tags } = input
  const payload = {
    article: {
      title: article.title,
      body_html: article.bodyHtml,
      handle: article.handle,
      published: true,
      tags: tags.join(", "),
      ...(config.author ? { author: config.author } : {}),
      metafields: [
        {
          namespace: "global",
          key: "title_tag",
          value: article.titleTag,
          type: "single_line_text_field",
        },
        {
          namespace: "global",
          key: "description_tag",
          value: article.metaDescription,
          type: "single_line_text_field",
        },
      ],
    },
  }

  const data = await shopifyFetch<{ article: ShopifyArticle }>(
    config,
    `/blogs/${blogId}/articles.json`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  )

  return data.article
}

export const publishOrReuseShopifyArticle = async (input: {
  config: ShopifyBlogClientConfig
  article: GeneratedShopifyBlogArticle
  tags: string[]
}): Promise<ShopifyArticle> => {
  const blogId = await resolveShopifyBlogId(input.config)
  const existing = await findShopifyArticleByHandle(
    input.config,
    blogId,
    input.article.handle,
  )
  if (existing) {
    return existing
  }
  return createShopifyBlogArticle({
    config: input.config,
    blogId,
    article: input.article,
    tags: input.tags,
  })
}
