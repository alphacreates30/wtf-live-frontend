import { marked } from 'marked'
import termsMarkdown from '../content/TERMS_OF_SALE.md?raw'
import './Terms.css'

const termsHtml = marked.parse(termsMarkdown)

export default function Terms() {
  return (
    <div className="page terms-page">
      <p className="terms-draft-notice">
        These terms are still being finalised (legal entity, state and pickup
        address are not yet filled in) and are <strong>not yet in force</strong>.
      </p>
      <div className="terms-content" dangerouslySetInnerHTML={{ __html: termsHtml }} />
    </div>
  )
}
