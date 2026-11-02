const TITLE_TAG_MAX = 60
const META_DESCRIPTION_MAX = 155
const DIACRITICS_RE = /[\u0300-\u036f]/g
const NON_SLUG_RE = /[^a-z0-9]+/g
const EDGE_DASH_RE = /^-+|-+$/g

export const truncateSeoField = (value: string, maxLength: number): string => {
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) {
    return trimmed
  }
  const sliced = trimmed.slice(0, maxLength).trimEnd()
  const lastSpace = sliced.lastIndexOf(" ")
  if (lastSpace > Math.floor(maxLength * 0.6)) {
    return sliced.slice(0, lastSpace).trimEnd()
  }
  return sliced
}

export const truncateTitleTag = (value: string): string =>
  truncateSeoField(value, TITLE_TAG_MAX)

export const truncateMetaDescription = (value: string): string =>
  truncateSeoField(value, META_DESCRIPTION_MAX)

export const normalizeHandle = (value: string): string =>
  value
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .toLowerCase()
    .replace(NON_SLUG_RE, "-")
    .replace(EDGE_DASH_RE, "")
    .slice(0, 255)

export const TITLE_TAG_MAX_LENGTH = TITLE_TAG_MAX
export const META_DESCRIPTION_MAX_LENGTH = META_DESCRIPTION_MAX
