import { describe, expect, test } from "vitest"
import {
  META_DESCRIPTION_MAX_LENGTH,
  normalizeHandle,
  TITLE_TAG_MAX_LENGTH,
  truncateMetaDescription,
  truncateTitleTag,
} from "../src/schedule/shopify-blog/seo"

const TRAILING_WHITESPACE_RE = /\s$/

describe("shopify blog seo helpers", () => {
  test("truncates title tags to 60 characters on a word boundary", () => {
    const long =
      "Beneficios del myo inositol para el equilibrio hormonal en mujeres mexicanas"
    const truncated = truncateTitleTag(long)
    expect(truncated.length).toBeLessThanOrEqual(TITLE_TAG_MAX_LENGTH)
    expect(truncated).not.toMatch(TRAILING_WHITESPACE_RE)
  })

  test("truncates meta descriptions to 155 characters", () => {
    const long = "palabra ".repeat(40)
    const truncated = truncateMetaDescription(long)
    expect(truncated.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX_LENGTH)
  })

  test("normalizes handles to ascii kebab-case", () => {
    expect(normalizeHandle("Creatina para Mujeres — Glúteos!")).toBe(
      "creatina-para-mujeres-gluteos",
    )
  })
})
