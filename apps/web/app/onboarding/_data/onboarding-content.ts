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

export const assessmentQuestions = [
  {
    skill: 'Reading',
    prompt: 'Choose the word that best completes the sentence: "The new software update _____ several bugs that were affecting user experience."',
    context: 'The sentence refers to a technical improvement in a product lifecycle.',
    options: ['resolved', 'resolving', 'resolution', 'resolve'],
    correctAnswer: 'resolved',
    insight: 'Câu hỏi này kiểm tra khả năng nhận biết dạng động từ phù hợp trong ngữ cảnh công việc.',
  },
  {
    skill: 'Listening',
    prompt: 'Choose the response that best fits this situation: "Could you repeat that more slowly, please?"',
    context: 'You are asking someone to speak at a slower pace during a conversation.',
    options: ['Of course, I will speak more slowly.', 'I repeated it yesterday.', 'You should repeat slowly.', 'I am slow because of it.'],
    correctAnswer: 'Of course, I will speak more slowly.',
    insight: 'Câu hỏi này kiểm tra phản xạ giao tiếp cơ bản trong tình huống nghe hằng ngày.',
  },
  {
    skill: 'Writing',
    prompt: 'Choose the sentence with correct grammar and punctuation.',
    context: 'Select the sentence that would be appropriate in a short professional email.',
    options: ['I am writing to confirm our meeting tomorrow.', 'I writing confirm our meeting tomorrow.', 'I am write to confirming our meeting tomorrow.', 'I write to confirmed our meeting tomorrow.'],
    correctAnswer: 'I am writing to confirm our meeting tomorrow.',
    insight: 'Câu hỏi này đánh giá nền tảng ngữ pháp và cách diễn đạt rõ ràng khi viết.',
  },
  {
    skill: 'Speaking',
    prompt: 'Choose the most natural way to introduce yourself in a new class.',
    context: 'You are meeting your classmates for the first time.',
    options: ['Hi, I am Minh. Nice to meet you all.', 'Hi, I Minh. Nice meeting all.', 'Hello, I am meet you all Minh.', 'Nice all, I meet Minh.'],
    correctAnswer: 'Hi, I am Minh. Nice to meet you all.',
    insight: 'Câu hỏi cuối cùng kiểm tra mẫu câu giao tiếp nền tảng và cách dùng tự nhiên.',
  },
]
