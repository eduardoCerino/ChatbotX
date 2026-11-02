import { shopifyBlogPublicationService } from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"
import { distributedLock, isLockAcquisitionError } from "@chatbotx.io/redis"
import { env } from "../../env"
import { isShopifyBlogPublisherConfigured } from "../shopify-blog/config"
import { shopifyBlogKeywords } from "../shopify-blog/keywords"
import {
  type GeneratedShopifyBlogArticle,
  generateShopifyBlogArticle,
} from "../shopify-blog/openai"
import { selectNextKeyword } from "../shopify-blog/select-next-keyword"
import {
  publishOrReuseShopifyArticle,
  resolveShopifyAccessToken,
} from "../shopify-blog/shopify-client"

const LOCK_KEY = "schedule:shopify-blog-publish"
const LOCK_TTL_SECONDS = 10 * 60
const LOCK_ACQUIRE_RETRY_SECONDS = 5
const log = getChildLogger("publish-shopify-blog-article")

export async function publishShopifyBlogArticle(): Promise<void> {
  if (!isShopifyBlogPublisherConfigured()) {
    log.info("Shopify blog publisher skipped: missing credentials")
    return
  }

  try {
    await distributedLock.runExclusive({
      key: LOCK_KEY,
      timeoutInSeconds: LOCK_TTL_SECONDS,
      retryTimeoutInSeconds: LOCK_ACQUIRE_RETRY_SECONDS,
      fn: async () => {
        await runPublishOnce()
      },
    })
  } catch (err) {
    if (isLockAcquisitionError(err, LOCK_KEY)) {
      log.warn(
        { err },
        "Shopify blog publish skipped: another run holds the lock",
      )
      return
    }
    throw err
  }
}

const runPublishOnce = async (): Promise<void> => {
  const publishedKeywords =
    await shopifyBlogPublicationService.listPublishedKeywords()
  const next = selectNextKeyword(shopifyBlogKeywords, publishedKeywords)

  if (!next) {
    log.info("Shopify blog publisher: no remaining keywords")
    return
  }

  const storeDomain = env.SHOPIFY_STORE_DOMAIN
  const openAiKey = env.SHOPIFY_BLOG_OPENAI_API_KEY
  if (!(storeDomain && openAiKey)) {
    return
  }

  // Before generation, so a Shopify auth failure does not spend an OpenAI call.
  let accessToken: string
  try {
    accessToken = await resolveShopifyAccessToken({
      storeDomain,
      accessToken: env.SHOPIFY_ADMIN_ACCESS_TOKEN,
      clientId: env.SHOPIFY_CLIENT_ID,
      clientSecret: env.SHOPIFY_CLIENT_SECRET,
    })
  } catch (err) {
    log.error(
      { err, keyword: next.keyword },
      "Shopify blog publish: Shopify token request failed; will retry next day",
    )
    return
  }

  const productUrl =
    next.product === "inositol"
      ? env.SHOPIFY_PRODUCT_URL_INOSITOL
      : env.SHOPIFY_PRODUCT_URL_CREATINA

  let article: GeneratedShopifyBlogArticle
  try {
    article = await generateShopifyBlogArticle({
      apiKey: openAiKey,
      entry: next,
      productUrl,
    })
  } catch (err) {
    log.error(
      { err, keyword: next.keyword },
      "Shopify blog publish: OpenAI generation failed; will retry next day",
    )
    return
  }

  let shopifyArticle: { id: number; handle: string; title: string }
  try {
    shopifyArticle = await publishOrReuseShopifyArticle({
      config: {
        storeDomain,
        accessToken,
        apiVersion: env.SHOPIFY_ADMIN_API_VERSION,
        blogId: env.SHOPIFY_BLOG_ID,
        author: env.SHOPIFY_ARTICLE_AUTHOR,
      },
      article,
      tags: next.tags,
    })
  } catch (err) {
    log.error(
      { err, keyword: next.keyword, handle: article.handle },
      "Shopify blog publish: Shopify API failed; will retry next day",
    )
    return
  }

  try {
    await shopifyBlogPublicationService.recordPublication({
      keyword: next.keyword,
      product: next.product,
      shopifyArticleId: String(shopifyArticle.id),
      handle: shopifyArticle.handle || article.handle,
      title: shopifyArticle.title || article.title,
    })
  } catch (err) {
    log.error(
      {
        err,
        keyword: next.keyword,
        shopifyArticleId: shopifyArticle.id,
      },
      "Shopify blog publish: article created but ledger insert failed",
    )
    throw err
  }

  log.info(
    {
      keyword: next.keyword,
      product: next.product,
      shopifyArticleId: shopifyArticle.id,
      handle: shopifyArticle.handle || article.handle,
    },
    "Shopify blog article published",
  )
}
