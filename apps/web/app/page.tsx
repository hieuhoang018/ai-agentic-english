import Link from 'next/link'

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background text-on-background dark:bg-inverse-surface dark:text-inverse-on-surface">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div>
          <h1 className="text-2xl font-bold text-primary dark:text-primary-fixed-dim">English Academy</h1>
          <p className="text-sm text-on-surface-variant dark:text-surface-dim">Wise Mentor AI</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/auth/sign-in" className="rounded-lg border border-outline-variant bg-white px-4 py-2 font-semibold text-on-surface dark:border-outline dark:bg-surface-dark dark:text-on-primary">Đăng nhập</Link>
          <Link href="/auth/sign-up" className="rounded-lg bg-primary px-4 py-2 font-semibold text-white">Tạo tài khoản</Link>
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-88px)] max-w-6xl items-center gap-10 px-6 py-12 lg:grid-cols-[1fr_420px]">
        <div>
          <h2 className="max-w-3xl text-5xl font-bold leading-tight text-on-surface dark:text-on-primary">Học tiếng Anh theo lộ trình cá nhân hóa cùng AI</h2>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-on-surface-variant dark:text-surface-dim">Wise Mentor phân tích mục tiêu, trình độ và thời gian học mỗi ngày để tạo bài tập, flashcard và lộ trình phù hợp với bạn.</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="/auth/sign-up" className="flex h-12 items-center gap-2 rounded-lg bg-primary px-6 font-bold text-white">Bắt đầu miễn phí<span className="material-symbols-outlined">arrow_forward</span></Link>
            <Link href="/main/homepage" className="flex h-12 items-center rounded-lg border border-outline-variant bg-white px-6 font-bold text-primary dark:text-primary-fixed-dim dark:border-outline dark:bg-surface-dark">Xem demo</Link>
          </div>
        </div>
        <div className="rounded-xl border border-outline-variant bg-white p-6 shadow-[0_18px_60px_-36px_rgba(15,23,42,0.8)] dark:border-outline dark:bg-surface-dark">
          <div className="rounded-lg bg-primary p-5 text-white">
            <p className="text-sm opacity-80">Daily task</p>
            <h3 className="mt-2 text-2xl font-bold">5 phút luyện nói với AI</h3>
          </div>
          <div className="mt-5 space-y-3">
            {['Từ vựng mới tự động vào Flashcard', 'Ngữ pháp đáng chú ý vào Review Center', 'Tiến độ lộ trình cập nhật sau mỗi buổi học'].map((item) => (
              <p key={item} className="flex gap-3 rounded-lg bg-surface p-3 dark:bg-surface-dark-high"><span className="material-symbols-outlined text-secondary">check_circle</span>{item}</p>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
