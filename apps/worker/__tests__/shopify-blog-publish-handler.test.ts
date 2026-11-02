import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  listPublishedKeywords,
  recordPublication,
  generateShopifyBlogArticle,
  publishOrReuseShopifyArticle,
  runExclusive,
  isLockAcquisitionError,
} = vi.hoisted(() => ({
  listPublishedKeywords: vi.fn(),
  recordPublication: vi.fn(),
  generateShopifyBlogArticle: vi.fn(),
  publishOrReuseShopifyArticle: vi.fn(),
  runExclusive: vi.fn(async ({ fn }: { fn: () => Promise<void> }) => fn()),
  isLockAcquisitionError: vi.fn(() => false),
}))

vi.mock("@chatbotx.io/business", () => ({
  shopifyBlogPublicationService: {
    listPublishedKeywords,
    recordPublication,
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive },
  isLockAcquisitionError,
}))

vi.mock("../src/schedule/shopify-blog/openai", () => ({
  generateShopifyBlogArticle,
}))

vi.mock("../src/schedule/shopify-blog/shopify-client", () => ({
  publishOrReuseShopifyArticle,
}))

vi.mock("../src/env", () => ({
  env: {
    SHOPIFY_STORE_DOMAIN: "demo.myshopify.com",
    SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat_test",
    SHOPIFY_BLOG_OPENAI_API_KEY: "sk-test",
    SHOPIFY_ADMIN_API_VERSION: "2025-10",
    SHOPIFY_BLOG_ID: undefined,
    SHOPIFY_ARTICLE_AUTHOR: undefined,
    SHOPIFY_PRODUCT_URL_INOSITOL: undefined,
    SHOPIFY_PRODUCT_URL_CREATINA: undefined,
  },
}))

vi.mock("../src/schedule/shopify-blog/keywords", () => ({
  shopifyBlogKeywords: [
    {
      keyword: "inositol para el sop",
      topic: "Inositol para el SOP",
      product: "inositol",
      tags: ["inositol", "hormonas"],
    },
  ],
}))

import { publishShopifyBlogArticle } from "../src/schedule/handlers/publish-shopify-blog-article"

describe("publishShopifyBlogArticle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listPublishedKeywords.mockResolvedValue([])
    runExclusive.mockImplementation(
      async ({ fn }: { fn: () => Promise<void> }) => fn(),
    )
  })

  test("does not record publication when OpenAI fails", async () => {
    generateShopifyBlogArticle.mockRejectedValue(new Error("openai down"))

    await publishShopifyBlogArticle()

    expect(publishOrReuseShopifyArticle).not.toHaveBeenCalled()
    expect(recordPublication).not.toHaveBeenCalled()
  })

  test("does not record publication when Shopify fails", async () => {
    generateShopifyBlogArticle.mockResolvedValue({
      title: "Titulo",
      bodyHtml: "<h1>Titulo</h1><p>cuerpo</p>",
      titleTag: "Titulo",
      metaDescription: "Meta",
      handle: "titulo",
    })
    publishOrReuseShopifyArticle.mockRejectedValue(new Error("shopify down"))

    await publishShopifyBlogArticle()

    expect(recordPublication).not.toHaveBeenCalled()
  })

  test("records publication after a successful Shopify publish", async () => {
    generateShopifyBlogArticle.mockResolvedValue({
      title: "Titulo",
      bodyHtml: "<h1>Titulo</h1><p>cuerpo</p>",
      titleTag: "Titulo",
      metaDescription: "Meta",
      handle: "titulo",
    })
    publishOrReuseShopifyArticle.mockResolvedValue({
      id: 42,
      handle: "titulo",
      title: "Titulo",
    })
    recordPublication.mockResolvedValue({})

    await publishShopifyBlogArticle()

    expect(recordPublication).toHaveBeenCalledWith(
      expect.objectContaining({
        keyword: "inositol para el sop",
        product: "inositol",
        shopifyArticleId: "42",
        handle: "titulo",
        title: "Titulo",
      }),
    )
  })
})
