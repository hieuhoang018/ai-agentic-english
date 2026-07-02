import ReviewEmptyState from '../_components/ReviewEmptyState'
import GrammarSection from '../_components/GrammarSection'
import ReviewHero from '../_components/ReviewHero'
import { getReviewGrammarSections } from '../_lib/review-api'

export const dynamic = 'force-dynamic'

export default async function GrammarPage() {
  const sections = await getReviewGrammarSections()

  return (
    <div>
      <ReviewHero
        title="On tap ngu phap"
        description="Cung co cau truc cau bang cac diem ngu phap lay truc tiep tu kho hoc lieu."
      />
      {sections.length > 0 ? (
        sections.map((section) => <GrammarSection key={section.id} section={section} />)
      ) : (
        <ReviewEmptyState
          icon="account_tree"
          title="No grammar sections found"
          description="Start Kong and the learning-materials service, then seed grammar points and refresh this page to load category-based review lessons."
        />
      )}
    </div>
  )
}
