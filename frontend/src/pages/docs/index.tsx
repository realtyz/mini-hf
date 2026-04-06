import { useParams, Navigate } from 'react-router'
import { DocLayout } from './components/DocLayout'
import { getDocList } from './components/docs.utils'

export function DocsPage() {
  const { slug } = useParams<{ slug: string }>()
  const docs = getDocList()

  // If no slug or invalid slug, redirect to first doc
  if (!slug || !docs.find(d => d.slug === slug)) {
    return <Navigate to={`/docs/${docs[0]?.slug || 'index'}`} replace />
  }

  return <DocLayout slug={slug} />
}

export default DocsPage
