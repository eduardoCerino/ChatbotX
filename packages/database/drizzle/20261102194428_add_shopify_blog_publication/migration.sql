CREATE TYPE "shopifyBlogProduct" AS ENUM('inositol', 'creatina');--> statement-breakpoint
CREATE TABLE "ShopifyBlogPublication" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"keyword" text NOT NULL,
	"product" "shopifyBlogProduct" NOT NULL,
	"shopifyArticleId" text NOT NULL,
	"handle" text NOT NULL,
	"title" text NOT NULL,
	"publishedAt" timestamp(6) with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ShopifyBlogPublication_keyword_key" ON "ShopifyBlogPublication" ("keyword");
