import ReviewHero from '../_components/ReviewHero'
import GrammarSection from '../_components/GrammarSection'
import { getGrammarSections } from '../_data/review-content'

export default function GrammarPage() {
  const sections = getGrammarSections()

  return (
    <div>
      <ReviewHero title="Ôn tập Ngữ pháp" description="Củng cố nền tảng cấu trúc câu qua các bài tập và lý thuyết chi tiết từ chuyên gia AI của chúng tôi." />
      {sections.map((section) => <GrammarSection key={section.id} section={section} />)}
    </div>
  )
}
