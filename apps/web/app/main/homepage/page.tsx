import React, { JSX } from 'react'

export default function HomePage(): JSX.Element {
	return (
		<>
			<div>
				<div>
					<h2 className="text-3xl font-bold text-on-surface dark:text-on-primary">Chào buổi sáng, Nguyễn! 👋</h2>
					<p className="text-base text-on-surface-variant dark:text-surface-dim mt-2">Sẵn sàng để tiếp tục hành trình chinh phục tiếng Anh của bạn chưa?</p>
				</div>

				<div className="flex flex-col gap-stack-lg w-full">
					<section className="w-full">
						<div className="bg-surface-container-lowest dark:bg-surface-container-high rounded-lg p-card-padding shadow-[0_4px_20px_-4px_rgba(15,98,254,0.08)] border border-outline-variant/20 dark:border-outline/20 flex flex-col justify-between hover:shadow-[0_8px_30px_-4px_rgba(15,98,254,0.12)] transition-shadow duration-300 w-full">
							<div className="flex justify-between items-start mb-6">
								<div>
									<h3 className="text-2xl font-semibold text-on-surface dark:text-on-primary">Tiến độ chung</h3>
									<p className="text-base text-on-surface-variant dark:text-surface-dim mt-1">Mục tiêu: Đạt IELTS 7.0</p>
								</div>
								<div className="bg-primary-container/10 px-3 py-1.5 rounded-full flex items-center gap-1.5 text-primary">
									<span className="material-symbols-outlined text-sm filled text-error">local_fire_department</span>
									<span className="text-sm font-bold">12 ngày streak</span>
								</div>
							</div>
							<div>
								<div className="flex justify-between text-sm mb-2">
									<span className="text-on-surface-variant dark:text-surface-dim">Lộ trình cá nhân hóa</span>
									<span className="text-primary font-bold">68%</span>
								</div>
								<div className="w-full h-3 bg-surface-container dark:bg-surface-variant rounded-full overflow-hidden">
									<div className="h-full bg-linear-to-r from-primary to-secondary-container w-[68%] rounded-full relative"></div>
								</div>
							</div>
						</div>
					</section>

					<section className="grid grid-cols-1 lg:grid-cols-2 gap-gutter w-full">
						<div className="flex flex-col gap-gutter h-full">
							<div className="bg-surface-container-lowest dark:bg-surface-container-high rounded-lg p-card-padding shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-outline-variant/20 dark:border-outline/20 hover:-translate-y-1 transition-transform cursor-pointer">
								<div className="flex items-center gap-3 mb-3">
									<div className="w-8 h-8 rounded-full bg-secondary-container/30 flex items-center justify-center text-on-secondary-container dark:text-secondary-fixed">
										<span className="material-symbols-outlined text-sm">psychology</span>
									</div>
									<h4 className="text-base font-bold text-on-surface dark:text-on-primary">Ôn tập từ vựng nhanh</h4>
								</div>
								<p className="text-sm text-on-surface-variant dark:text-surface-dim mb-4">Bạn có 15 từ cần ôn lại hôm nay theo phương pháp lặp lại ngắt quãng.</p>
								<button className="w-full py-2 bg-surface-container-high dark:bg-surface-variant hover:bg-surface-variant dark:hover:bg-surface-container text-on-surface dark:text-on-primary rounded-lg text-sm font-medium transition-colors border border-outline-variant/50 dark:border-outline/50">Ôn tập ngay</button>
							</div>
							<div className="bg-linear-to-br from-tertiary-fixed to-primary-fixed dark:from-tertiary dark:to-primary rounded-lg p-card-padding shadow-[0_4px_20px_-4px_rgba(106,0,242,0.15)] flex flex-col justify-between relative overflow-hidden group cursor-pointer flex-1">
								<div className="absolute -right-4 -top-4 w-24 h-24 bg-white/20 rounded-full blur-2xl"></div>
								<div className="relative z-10">
									<div className="bg-white/50 dark:bg-black/20 w-10 h-10 rounded-full flex items-center justify-center mb-4 backdrop-blur-sm">
										<span className="material-symbols-outlined text-tertiary dark:text-tertiary-fixed">smart_toy</span>
									</div>
									<h3 className="text-2xl font-semibold text-on-tertiary-fixed dark:text-on-primary">Trò chuyện với AI Tutor</h3>
									<p className="text-base text-on-tertiary-fixed/80 dark:text-on-primary/80 mt-2 line-clamp-2">Thực hành giao tiếp tự nhiên và nhận phản hồi tức thì.</p>
								</div>
								<div className="relative z-10 mt-6 flex items-center text-tertiary dark:text-tertiary-fixed font-bold group-hover:translate-x-1 transition-transform">
									<span className="text-base mr-1">Bắt đầu ngay</span>
									<span className="material-symbols-outlined text-sm">arrow_forward</span>
								</div>
							</div>
						</div>
						<div className="bg-surface-container-lowest dark:bg-surface-container-high rounded-lg p-card-padding shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-outline-variant/20 dark:border-outline/20 h-full">
							<div className="flex justify-between items-center mb-6">
								<h3 className="text-2xl font-semibold text-on-surface dark:text-on-primary">Nhiệm vụ hàng ngày</h3>
								<span className="text-sm bg-surface-container dark:bg-surface-variant px-2 py-1 rounded-md text-on-surface-variant dark:text-surface-dim">2/4 hoàn thành</span>
							</div>
							<div className="space-y-3">
								<div className="flex items-start gap-3 p-3 rounded-lg bg-surface-container-low/50 dark:bg-surface-variant/50 opacity-70">
									<span className="material-symbols-outlined text-secondary mt-0.5">check_circle</span>
									<div>
										<h4 className="text-base line-through text-on-surface-variant dark:text-surface-dim">Học 5 từ vựng mới</h4>
										<p className="text-sm text-on-surface-variant/80 dark:text-surface-dim/80 mt-1">Chủ đề: Công nghệ</p>
									</div>
								</div>
								<div className="flex items-start gap-3 p-3 rounded-lg bg-surface-container-low/50 dark:bg-surface-variant/50 opacity-70">
									<span className="material-symbols-outlined text-secondary mt-0.5">check_circle</span>
									<div>
										<h4 className="text-base line-through text-on-surface-variant dark:text-surface-dim">Hoàn thành 1 bài đọc ngắn</h4>
										<p className="text-sm text-on-surface-variant/80 dark:text-surface-dim/80 mt-1">Chủ đề: Môi trường</p>
									</div>
								</div>
								<div className="flex items-start gap-3 p-3 rounded-lg bg-surface-container dark:bg-surface-variant border-l-2 border-primary cursor-pointer hover:bg-surface-container-high dark:hover:bg-surface-container transition-colors group">
									<span className="material-symbols-outlined text-outline mt-0.5">radio_button_unchecked</span>
									<div className="flex-1">
										<h4 className="text-base text-on-surface dark:text-on-primary group-hover:text-primary transition-colors">5 phút luyện nói với AI</h4>
										<p className="text-sm text-on-surface-variant dark:text-surface-dim mt-1">Luyện tập phát âm và phản xạ.</p>
									</div>
									<button className="text-primary hover:bg-primary-container/20 p-1.5 rounded-full transition-colors">
										<span className="material-symbols-outlined text-sm">play_arrow</span>
									</button>
								</div>
								<div className="flex items-start gap-3 p-3 rounded-lg bg-surface-container dark:bg-surface-variant border-l-2 border-transparent cursor-pointer hover:bg-surface-container-high dark:hover:bg-surface-container transition-colors group">
									<span className="material-symbols-outlined text-outline mt-0.5">radio_button_unchecked</span>
									<div className="flex-1">
										<h4 className="text-base text-on-surface dark:text-on-primary group-hover:text-primary transition-colors">Làm 1 bài tập ngữ pháp</h4>
										<p className="text-sm text-on-surface-variant dark:text-surface-dim mt-1">Thì hiện tại hoàn thành.</p>
									</div>
									<button className="text-primary hover:bg-primary-container/20 p-1.5 rounded-full transition-colors">
										<span className="material-symbols-outlined text-sm">play_arrow</span>
									</button>
								</div>
							</div>
						</div>
					</section>
				</div>
			</div>
		</>
	)
}
