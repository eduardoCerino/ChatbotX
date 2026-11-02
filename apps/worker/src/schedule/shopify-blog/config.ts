import { env } from "../../env"

// Kept apart from the handler so register-schedules does not pull in
// @chatbotx.io/business (and its whole import graph) just to read env.
export const isShopifyBlogPublisherConfigured = (): boolean =>
  Boolean(
    env.SHOPIFY_STORE_DOMAIN &&
      env.SHOPIFY_BLOG_OPENAI_API_KEY &&
      (env.SHOPIFY_ADMIN_ACCESS_TOKEN ||
        (env.SHOPIFY_CLIENT_ID && env.SHOPIFY_CLIENT_SECRET)),
  )
