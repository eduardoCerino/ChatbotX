import { type DatabaseClient, db, eq } from "../../client"
import { shopifyBlogPublicationModel } from "../../schema"
import type { ShopifyBlogPublicationModel } from "../../types"

export type ShopifyBlogPublicationInsert = {
  keyword: string
  product: ShopifyBlogPublicationModel["product"]
  shopifyArticleId: string
  handle: string
  title: string
  publishedAt: Date
}

export const shopifyBlogPublicationRepository = {
  async listPublishedKeywords(tx: DatabaseClient = db): Promise<string[]> {
    const rows = await tx
      .select({ keyword: shopifyBlogPublicationModel.keyword })
      .from(shopifyBlogPublicationModel)
    return rows.map((row) => row.keyword)
  },

  async insert(
    input: ShopifyBlogPublicationInsert,
    tx: DatabaseClient = db,
  ): Promise<ShopifyBlogPublicationModel> {
    const [row] = await tx
      .insert(shopifyBlogPublicationModel)
      .values(input)
      .returning()
    return row
  },

  async findByKeyword(
    keyword: string,
    tx: DatabaseClient = db,
  ): Promise<ShopifyBlogPublicationModel | undefined> {
    const [row] = await tx
      .select()
      .from(shopifyBlogPublicationModel)
      .where(eq(shopifyBlogPublicationModel.keyword, keyword))
      .limit(1)
    return row
  },
}
