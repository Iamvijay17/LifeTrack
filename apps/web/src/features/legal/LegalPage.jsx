import { Link } from 'react-router-dom'
import { Logo } from '@/components/layout/Logo'
import { Markdown } from '@/lib/markdown'
// Single source of truth: the same Markdown files are what the store listings link to (docs/legal/*.md).
import privacy from '../../../../../docs/legal/PRIVACY_POLICY.md?raw'
import terms from '../../../../../docs/legal/TERMS_OF_SERVICE.md?raw'

const DOCS = { privacy, terms }

/** Public (no sign-in) page for the privacy policy and terms; app stores require a public URL. */
export default function LegalPage({ doc }) {
  return (
    <div className="min-h-dvh">
      <div className="mx-auto w-full max-w-2xl px-5 py-10">
        <Link to="/" className="mb-8 inline-block">
          <Logo />
        </Link>
        <article className="prose-sm">
          <Markdown source={DOCS[doc]} />
        </article>
        <p className="mt-10 text-sm text-muted-foreground">
          <Link className="text-secondary hover:underline" to="/privacy">
            Privacy policy
          </Link>{' '}
          ·{' '}
          <Link className="text-secondary hover:underline" to="/terms">
            Terms of service
          </Link>
        </p>
      </div>
    </div>
  )
}
