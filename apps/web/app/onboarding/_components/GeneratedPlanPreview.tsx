export default function GeneratedPlanPreview() {
  return (
    <div className="mx-auto max-w-3xl rounded-xl bg-white p-8 shadow-[0_18px_52px_-34px_rgba(15,23,42,0.8)]">
      <h2 className="mb-6 flex items-center gap-3 text-2xl font-bold"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white">↝</span>Lộ Trình Đề Xuất</h2>
      <div className="space-y-5 border-l-2 border-outline-variant pl-7">
        {[
          ['Giai đoạn 1', 'Xây Dựng Nền Tảng', '1-2 Tháng', 'Củng cố ngữ pháp cốt lõi và mở rộng từ vựng cơ bản phục vụ giao tiếp hằng ngày.'],
          ['Giai đoạn 2', 'Tăng Tốc Phản Xạ', '3-6 Tháng', 'Thực hành đàm thoại thực tế với AI và người bản xứ mô phỏng.'],
        ].map(([stage, title, time, body]) => (
          <article key={stage} className="relative rounded-lg border border-outline-variant bg-surface p-5">
            <span className="absolute -left-[38px] top-5 h-5 w-5 rounded-full border-4 border-primary bg-white" />
            <div className="flex justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase text-primary">{stage}</p>
                <h3 className="mt-1 text-lg font-bold">{title}</h3>
              </div>
              <span className="h-fit rounded-full bg-primary-fixed px-3 py-1 text-xs font-bold text-primary">{time}</span>
            </div>
            <p className="mt-4 font-semibold text-on-surface-variant">{body}</p>
          </article>
        ))}
      </div>
      <div className="mt-7 rounded-lg bg-violet-100 p-5 text-tertiary">
        <h3 className="font-bold">Thành Quả Dự Kiến</h3>
        <p className="mt-2">Hoàn thành lộ trình này, bạn sẽ tự tin giao tiếp trong môi trường công sở và đạt mức tương đương IELTS 6.0.</p>
      </div>
    </div>
  )
}
