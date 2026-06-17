import React from 'react'

export default function PracticeCenterPage() {
  return (
    <>
      <div className="mb-stack-lg">
        <h1 className="font-headline-lg text-headline-lg text-on-background mb-sm">Trung tâm thực hành</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-3xl">Chọn một kỹ năng để bắt đầu luyện tập. Hệ thống AI sẽ điều chỉnh độ khó dựa trên trình độ hiện tại của bạn.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg mb-xl">
        <div className="bg-surface-container-lowest rounded-xl p-lg border border-outline-variant flat-shadow hover:shadow-lg transition-shadow duration-300 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-tertiary-fixed-dim group-hover:bg-tertiary! transition-colors"></div>
          <div className="flex items-start gap-md mb-md">
            <div className="w-12 h-12 rounded-lg bg-tertiary-container/30 flex items-center justify-center text-tertiary">
              <span className="material-symbols-outlined text-3xl">menu_book</span>
            </div>
            <div>
              <h2 className="font-headline-md text-headline-md text-on-surface mb-xs">Luyện Đọc</h2>
              <p className="text-on-surface-variant">Nâng cao vốn từ vựng và kỹ năng hiểu qua các bài báo và đoạn văn thực tế.</p>
            </div>
          </div>
          <a className="inline-flex items-center gap-sm text-primary font-label-md text-label-md group-hover:text-primary-container transition-colors mt-md" href="#">
            Bắt đầu luyện tập
            <span className="material-symbols-outlined text-sm transition-transform group-hover:translate-x-1">arrow_forward</span>
          </a>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-lg border border-outline-variant flat-shadow hover:shadow-lg transition-shadow duration-300 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-secondary-container/60 group-hover:bg-secondary! transition-colors"></div>
          <div className="flex items-start gap-md mb-md">
            <div className="w-12 h-12 rounded-lg bg-secondary-container/30 flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-3xl">headphones</span>
            </div>
            <div>
              <h2 className="font-headline-md text-headline-md text-on-surface mb-xs">Luyện Nghe</h2>
              <p className="text-on-surface-variant">Cải thiện khả năng nhận diện âm thanh và ngữ điệu với các đoạn hội thoại đa dạng.</p>
            </div>
          </div>
          <a className="inline-flex items-center gap-sm text-primary font-label-md text-label-md group-hover:text-primary-container transition-colors mt-md" href="#">
            Bắt đầu luyện tập
            <span className="material-symbols-outlined text-sm transition-transform group-hover:translate-x-1">arrow_forward</span>
          </a>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-lg border border-outline-variant flat-shadow hover:shadow-lg transition-shadow duration-300 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-primary-fixed group-hover:bg-primary! transition-colors"></div>
          <div className="flex items-start gap-md mb-md">
            <div className="w-12 h-12 rounded-lg bg-primary-fixed/50 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-3xl">edit</span>
            </div>
            <div>
              <h2 className="font-headline-md text-headline-md text-on-surface mb-xs">Luyện Viết</h2>
              <p className="text-on-surface-variant">Luyện tập ngữ pháp và cấu trúc câu thông qua các bài luận và email mẫu.</p>
            </div>
          </div>
          <a className="inline-flex items-center gap-sm text-primary font-label-md text-label-md group-hover:text-primary-container transition-colors mt-md" href="#">
            Bắt đầu luyện tập
            <span className="material-symbols-outlined text-sm transition-transform group-hover:translate-x-1">arrow_forward</span>
          </a>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-lg border border-outline-variant flat-shadow hover:shadow-lg transition-shadow duration-300 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-error-container group-hover:bg-error! transition-colors"></div>
          <div className="flex items-start gap-md mb-md">
            <div className="w-12 h-12 rounded-lg bg-error-container/50 flex items-center justify-center text-error">
              <span className="material-symbols-outlined text-3xl">mic</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-sm mb-xs">
                <h2 className="font-headline-md text-headline-md text-on-surface">Luyện Nói</h2>
                <span className="bg-surface-tint text-on-primary px-2 py-0.5 rounded-full font-caption text-caption">AI Đánh giá</span>
              </div>
              <p className="text-on-surface-variant">Tương tác trực tiếp với AI để chỉnh sửa phát âm và phản xạ giao tiếp.</p>
            </div>
          </div>
          <a className="inline-flex items-center gap-sm text-primary font-label-md text-label-md group-hover:text-primary-container transition-colors mt-md" href="#">
            Bắt đầu luyện tập
            <span className="material-symbols-outlined text-sm transition-transform group-hover:translate-x-1">arrow_forward</span>
          </a>
        </div>
      </div>

      <div>
        <h3 className="font-headline-md text-headline-md text-on-surface mb-md">Hoạt động gần đây</h3>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-md flex items-center justify-between flat-shadow hover:bg-surface-container-low transition-colors cursor-pointer">
          <div className="flex items-center gap-md">
            <div className="w-10 h-10 rounded-full bg-secondary-container/30 flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined">headphones</span>
            </div>
            <div>
              <h4 className="font-label-md text-label-md text-on-surface">Bài tập: Hội thoại nhà hàng</h4>
              <p className="font-caption text-caption text-on-surface-variant">Luyện nghe • 10 phút trước</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-sm w-48">
            <span className="font-caption text-caption text-on-surface-variant">Đang tiến hành (60%)</span>
            <div className="w-full h-2 bg-surface-variant rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: '60%' }} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
