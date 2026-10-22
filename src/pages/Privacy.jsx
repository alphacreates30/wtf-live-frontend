import { marked } from 'marked'
import privacyMarkdown from '../content/PRIVACY_POLICY.md?raw'
import './Terms.css'

const privacyHtml = marked.parse(privacyMarkdown)
// A1's facts still to fill in (legal entity, business address, effective date). While any is left, the page says so.
const PLACEHOLDER = /\[(LEGAL ENTITY NAME|BUSINESS POSTAL ADDRESS|EFFECTIVE DATE)\]/

export default function Privacy() {
  return (
    <div className="page terms-page">
      {PLACEHOLDER.test(privacyMarkdown) && (
        <p className="terms-draft-notice">
          <strong>Draft.</strong> This policy is still being finalised (the business name, postal address and
          effective date are not yet filled in).
        </p>
      )}
      <div className="terms-content" dangerouslySetInnerHTML={{ __html: privacyHtml }} />
    </div>
  )
}
