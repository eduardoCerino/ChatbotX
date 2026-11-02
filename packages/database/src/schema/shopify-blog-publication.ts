import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { sharedColumns, timestampConfig } from "../partials/shared"
import { shopifyBlogProducts } from "../partials/shopify-blog"

export const shopifyBlogProduct = pgEnum(
  "shopifyBlogProduct",
  shopifyBlogProducts.options as [string, ...string[]],
)

/**
 * Global ledger of Shopify blog articles published by the daily schedule job.
 * No workspaceId — the cron is a single-store operator feature, not workspace data.
 */
export const shopifyBlogPublicationModel = pgTable(
  "ShopifyBlogPublication",
  {
    ...sharedColumns,
    keyword: text().notNull(),
    product: shopifyBlogProduct().notNull(),
    shopifyArticleId: text().notNull(),
    handle: text().notNull(),
    title: text().notNull(),
    publishedAt: timestamp(timestampConfig).notNull(),
  },
  (table) => [
    uniqueIndex("ShopifyBlogPublication_keyword_key").on(table.keyword),
  ],
)
