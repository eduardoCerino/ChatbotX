import type { ShopifyBlogKeyword } from "./keywords"

export const selectNextKeyword = (
  keywords: readonly ShopifyBlogKeyword[],
  publishedKeywords: ReadonlySet<string> | readonly string[],
): ShopifyBlogKeyword | undefined => {
  const published =
    publishedKeywords instanceof Set
      ? publishedKeywords
      : new Set(publishedKeywords)

  for (const entry of keywords) {
    if (!published.has(entry.keyword)) {
      return entry
    }
  }

  return
}
