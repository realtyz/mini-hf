export interface DocMeta {
  slug: string
  title: string
  order: number
}

export interface DocMetaData {
  docs: DocMeta[]
}

export interface TocItem {
  id: string
  text: string
  level: number
}
