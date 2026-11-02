import { describe, expect, test } from "vitest"
import type { ShopifyBlogKeyword } from "../src/schedule/shopify-blog/keywords"
import { selectNextKeyword } from "../src/schedule/shopify-blog/select-next-keyword"

const sample: ShopifyBlogKeyword[] = [
  {
    keyword: "a",
    topic: "A",
    product: "inositol",
    tags: ["inositol"],
  },
  {
    keyword: "b",
    topic: "B",
    product: "creatina",
    tags: ["creatina"],
  },
  {
    keyword: "c",
    topic: "C",
    product: "inositol",
    tags: ["inositol"],
  },
]

describe("selectNextKeyword", () => {
  test("returns the first unpublished keyword in order", () => {
    expect(selectNextKeyword(sample, ["a"])?.keyword).toBe("b")
  })

  test("returns undefined when every keyword is published", () => {
    expect(selectNextKeyword(sample, ["a", "b", "c"])).toBeUndefined()
  })

  test("accepts a Set of published keywords", () => {
    expect(selectNextKeyword(sample, new Set(["a", "b"]))?.keyword).toBe("c")
  })
})
