import ProgressSummaryCard from '../review-center/_components/ProgressSummaryCard'

export default function ProgressPage() {
  return (
    <div>
      <h1 className="mb-8 text-3xl font-bold text-on-surface sm:text-4xl">Tiến độ học tập chi tiết</h1>

      <section className="mb-8 rounded-lg border border-outline-variant bg-surface-container-lowest p-4 shadow-[0_10px_32px_-24px_rgba(15,23,42,0.55)] sm:p-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-lg text-on-surface">Lộ trình IELTS 7.0</p>
            <p className="mt-2 text-on-surface-variant">Giai đoạn hiện tại: Xây dựng nền tảng (Phase 1)</p>
          </div>
          <div className="text-left md:text-right">
            <p className="text-5xl font-bold text-primary sm:text-6xl">28%</p>
            <p className="text-sm text-on-surface-variant">Tổng tiến độ hoàn thành</p>
          </div>
        </div>
        <div className="mt-10 grid grid-cols-1 items-end gap-6 sm:mt-12 sm:grid-cols-3 sm:gap-4">
          {[
            ['check_circle', 'Foundation', 'Tháng 1-2', 'text-primary'],
            ['rocket_launch', 'Intermediate', 'Tháng 3-4 (Hiện tại)', 'text-primary'],
            ['lock', 'Advanced', 'Tháng 5-6', 'text-outline'],
          ].map(([icon, title, time, tone]) => (
            <div key={title} className="text-center">
              <span className={`material-symbols-outlined text-4xl ${tone}`}>{icon}</span>
              <p className={`mt-2 font-bold ${tone}`}>{title}</p>
              <p className="text-sm text-on-surface-variant">{time}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-variant">
          <div className="h-full w-[28%] rounded-full bg-linear-to-r from-primary to-secondary" />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4 shadow-[0_10px_32px_-24px_rgba(15,23,42,0.55)] sm:p-6">
          <h2 className="mb-6 flex items-center gap-3 border-b border-outline-variant pb-4 text-2xl font-bold"><span className="rounded-lg bg-violet-100 p-2 text-tertiary material-symbols-outlined">flag</span>Mục tiêu cuối cùng</h2>
          <div className="mb-7 text-center">
            <p className="text-5xl font-bold text-primary">IELTS 7.0</p>
            <p className="mt-3 text-on-surface-variant">Dự kiến đạt được vào 15/12/2024</p>
          </div>
          <div className="space-y-4">
            <ProgressSummaryCard label="Reading (Target: 7.5)" current="Hiện tại: 6.5" value={85} tone="bg-secondary" />
            <ProgressSummaryCard label="Listening (Target: 7.5)" current="Hiện tại: 7.0" value={90} tone="bg-secondary" />
            <ProgressSummaryCard label="Writing (Target: 6.5)" current="Hiện tại: 5.5" value={70} />
            <ProgressSummaryCard label="Speaking (Target: 6.5)" current="Hiện tại: 6.0" value={80} />
          </div>
        </section>

        <section className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4 shadow-[0_10px_32px_-24px_rgba(15,23,42,0.55)] sm:p-6">
          <h2 className="mb-6 flex items-center gap-3 border-b border-outline-variant pb-4 text-2xl font-bold"><span className="rounded-lg bg-emerald-100 p-2 text-secondary material-symbols-outlined">bar_chart</span>Biểu đồ hoạt động</h2>
          <div className="flex h-64 items-end justify-between gap-2 border-b border-outline-variant px-1 sm:gap-4 sm:px-4">
            {[25, 55, 35, 80, 45, 62, 30].map((height, index) => (
              <div key={index} className="flex flex-1 flex-col items-center justify-end gap-3">
                <div className="w-full max-w-8 rounded-t bg-primary" style={{ height: `${height}%` }} />
                <span className="text-sm text-on-surface-variant">{['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][index]}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-col gap-2 text-sm sm:flex-row sm:justify-between">
            <span>Tổng thời gian: 11.4 giờ</span>
            <span className="font-bold text-primary">Xem chi tiết</span>
          </div>
        </section>
      </div>
    </div>
  )
}
