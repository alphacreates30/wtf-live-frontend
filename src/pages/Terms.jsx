import { marked } from 'marked'
import termsMarkdown from '../content/TERMS_OF_SALE.md?raw'
import './Terms.css'

const termsHtml = marked.parse(termsMarkdown)

export default function Terms() {
  return (
    <div className="page terms-page">
      <div className="terms-content" dangerouslySetInnerHTML={{ __html: termsHtml }} />
    </div>
  )
}
