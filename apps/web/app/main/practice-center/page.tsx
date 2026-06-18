import Link from 'next/link'
import PracticeHero from './_components/PracticeHero'
import { speakingPath } from './_utils/routes'

const skillCards = [
  {
    title: 'Luyện Đọc',
    description: 'Nâng cao vốn từ vựng và kỹ năng hiểu qua các bài báo và đoạn văn thực tế.',
    icon: 'menu_book',
    href: '/main/practice-center/reading',
    iconClass: 'bg-tertiary-container/30 text-tertiary',
    stripeClass: 'bg-tertiary-fixed-dim/60 group-hover:bg-tertiary!',
  },
  {
    title: 'Luyện Nghe',
    description: 'Cải thiện khả năng nhận diện âm thanh và ngữ điệu với các đoạn hội thoại đa dạng.',
    icon: 'headphones',
    href: '/main/practice-center/listening',
    iconClass: 'bg-secondary-container/30 text-secondary',
    stripeClass: 'bg-secondary-container/30 group-hover:bg-secondary!',
  },
  {
    title: 'Luyện Viết',
    description: 'Luyện tập ngữ pháp và cấu trúc câu thông qua các bài luận và email mẫu.',
    icon: 'edit',
    href: '/main/practice-center/writing',
    iconClass: 'bg-primary-fixed/50 text-primary',
    stripeClass: 'bg-primary-fixed group-hover:bg-primary!',
  },
  {
    title: 'Luyện Nói',
    description: 'Tương tác trực tiếp với AI để chỉnh sửa phát âm và phản xạ giao tiếp.',
    icon: 'mic',
    href: speakingPath(),
    iconClass: 'bg-error-container/50 text-error',
    stripeClass: 'bg-error-container group-hover:bg-error!',
    badge: 'AI Đánh giá',
  },
]

export default function PracticeCenterPage() {
  return (
    <div>
      <PracticeHero
        title="Trung tâm thực hành"
        description="Chọn một kỹ năng để bắt đầu luyện tập. Hệ thống AI sẽ điều chỉnh độ khó dựa trên trình độ hiện tại của bạn."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg mb-xl">
        {skillCards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="bg-surface-container-lowest rounded-xl p-lg border border-outline-variant flat-shadow hover:shadow-lg transition-shadow duration-300 relative overflow-hidden group"
          >
            <div className={`absolute top-0 left-0 w-full h-1 transition-colors ${card.stripeClass}`} />
            <div className="flex items-start gap-md mb-md">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${card.iconClass}`}>
                <span className="material-symbols-outlined text-3xl">{card.icon}</span>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-sm mb-xs">
                  <h2 className="font-headline-md text-headline-md text-on-surface">{card.title}</h2>
                  {card.badge ? (
                    <span className="bg-surface-tint text-on-primary px-2 py-0.5 rounded-full font-caption text-caption">
                      {card.badge}
                    </span>
                  ) : null}
                </div>
                <p className="text-on-surface-variant leading-7">{card.description}</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-sm text-primary font-label-md text-label-md group-hover:text-primary-container transition-colors mt-md">
              Bắt đầu luyện tập
              <span className="material-symbols-outlined text-sm transition-transform group-hover:translate-x-1">arrow_forward</span>
            </span>
          </Link>
        ))}
      </div>

      <section>
        <h3 className="font-headline-md text-headline-md text-on-surface mb-md">Hoạt động gần đây</h3>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-md flex flex-col gap-4 md:flex-row md:items-center md:justify-between flat-shadow hover:bg-surface-container-low transition-colors">
          <div className="flex items-center gap-md">
            <div className="w-10 h-10 rounded-full bg-secondary-container/30 flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined">headphones</span>
            </div>
            <div>
              <h4 className="font-label-md text-label-md text-on-surface">Bài tập: Hội thoại nhà hàng</h4>
              <p className="font-caption text-caption text-on-surface-variant">Luyện nghe • 10 phút trước</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-sm w-full md:w-48">
            <span className="font-caption text-caption text-on-surface-variant">Đang tiến hành (60%)</span>
            <div className="w-full h-2 bg-surface-variant rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: '60%' }} />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
