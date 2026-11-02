import { z } from "zod"
import type { ShopifyBlogKeyword } from "./keywords"
import {
  buildShopifyBlogUserPrompt,
  SHOPIFY_BLOG_SYSTEM_PROMPT,
} from "./prompts"
import {
  normalizeHandle,
  truncateMetaDescription,
  truncateTitleTag,
} from "./seo"

const generatedArticleSchema = z.object({
  title: z.string().min(1),
  bodyHtml: z.string().min(1),
  titleTag: z.string().min(1),
  metaDescription: z.string().min(1),
  handle: z.string().min(1),
})

export type GeneratedShopifyBlogArticle = {
  title: string
  bodyHtml: string
  titleTag: string
  metaDescription: string
  handle: string
}

type OpenAIChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null
    }
  }>
}

export const generateShopifyBlogArticle = async (input: {
  apiKey: string
  entry: ShopifyBlogKeyword
  productUrl?: string
  fetchImpl?: typeof fetch
}): Promise<GeneratedShopifyBlogArticle> => {
  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SHOPIFY_BLOG_SYSTEM_PROMPT },
          {
            role: "user",
            content: buildShopifyBlogUserPrompt({
              entry: input.entry,
              productUrl: input.productUrl,
            }),
          },
        ],
      }),
    },
  )

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(
      `OpenAI chat completions failed (${response.status}): ${body.slice(0, 500)}`,
    )
  }

  const json = (await response.json()) as OpenAIChatCompletionResponse
  const content = json.choices?.[0]?.message?.content
  if (!content) {
    throw new Error("OpenAI returned an empty article payload")
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (err) {
    throw new Error("OpenAI returned non-JSON article content", { cause: err })
  }

  const article = generatedArticleSchema.parse(parsed)
  return {
    title: article.title.trim(),
    bodyHtml: article.bodyHtml.trim(),
    titleTag: truncateTitleTag(article.titleTag),
    metaDescription: truncateMetaDescription(article.metaDescription),
    handle: normalizeHandle(article.handle),
  }
}
