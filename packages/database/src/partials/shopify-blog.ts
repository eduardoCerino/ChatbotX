import { z } from "zod"

export const shopifyBlogProducts = z.enum(["inositol", "creatina"])
export type ShopifyBlogProduct = z.infer<typeof shopifyBlogProducts>
