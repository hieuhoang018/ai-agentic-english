import type { GoalOption, SkillOption } from '../_types/onboarding'

export const goals: GoalOption[] = [
  { id: 'conversation', title: 'Giao tiếp trôi chảy', description: 'Tự tin nói chuyện hằng ngày', icon: 'forum', tone: 'bg-blue-50 text-primary' },
  { id: 'ielts', title: 'IELTS / TOEFL', description: 'Luyện thi chứng chỉ quốc tế', icon: 'school', tone: 'bg-violet-50 text-tertiary' },
  { id: 'business', title: 'Tiếng Anh Công sở', description: 'Phát triển nghề nghiệp', icon: 'business_center', tone: 'bg-emerald-50 text-secondary' },
  { id: 'travel', title: 'Du lịch & Khám phá', description: 'Hành trang cho những chuyến đi', icon: 'flight_takeoff', tone: 'bg-orange-50 text-orange-700' },
  { id: 'personal', title: 'Sở thích cá nhân', description: 'Xem phim, đọc sách, nghe nhạc', icon: 'auto_awesome', tone: 'bg-surface-container text-on-surface-variant' },
]

export const skills: SkillOption[] = [
  { id: 'listening', label: 'Nghe', icon: 'headphones' },
  { id: 'speaking', label: 'Nói', icon: 'mic' },
  { id: 'reading', label: 'Đọc', icon: 'menu_book' },
  { id: 'writing', label: 'Viết', icon: 'edit_note' },
]
