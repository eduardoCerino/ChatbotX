import type { DatabaseClient } from "@chatbotx.io/database/client"
import type { ShopifyBlogProduct } from "@chatbotx.io/database/partials"
import {
  type ShopifyBlogPublicationInsert,
  shopifyBlogPublicationRepository,
} from "@chatbotx.io/database/repositories"
import type { ShopifyBlogPublicationModel } from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"

class ShopifyBlogPublicationService extends BaseService {
  async listPublishedKeywords(tx?: DatabaseClient): Promise<string[]> {
    return await shopifyBlogPublicationRepository.listPublishedKeywords(tx)
  }

  async findByKeyword(
    keyword: string,
    tx?: DatabaseClient,
  ): Promise<ShopifyBlogPublicationModel | undefined> {
    return await shopifyBlogPublicationRepository.findByKeyword(keyword, tx)
  }

  async recordPublication(
    input: {
      keyword: string
      product: ShopifyBlogProduct
      shopifyArticleId: string
      handle: string
      title: string
      publishedAt?: Date
    },
    tx?: DatabaseClient,
  ): Promise<ShopifyBlogPublicationModel> {
    const row: ShopifyBlogPublicationInsert = {
      keyword: input.keyword,
      product: input.product,
      shopifyArticleId: input.shopifyArticleId,
      handle: input.handle,
      title: input.title,
      publishedAt: input.publishedAt ?? new Date(),
    }
    return await shopifyBlogPublicationRepository.insert(row, tx)
  }
}

export const shopifyBlogPublicationService = new ShopifyBlogPublicationService()
