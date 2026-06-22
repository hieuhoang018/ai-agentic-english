import type { Flashcard, FlashcardTopic, GrammarLesson, GrammarSection } from '../_types/review'

export const flashcardTopics: FlashcardTopic[] = [
  { id: 'technology', title: 'Technology', description: 'Từ vựng về công nghệ, phần mềm và phần cứng.', icon: 'computer', totalCards: 45, learnedCards: 15, tone: 'from-blue-100 to-blue-200 text-primary' },
  { id: 'business', title: 'Business English', description: 'Thuật ngữ kinh doanh, giao tiếp văn phòng.', icon: 'business_center', totalCards: 60, learnedCards: 20, tone: 'from-emerald-100 to-emerald-200 text-[#0a9f5a]' },
  { id: 'travel', title: 'Travel & Tourism', description: 'Từ vựng hữu ích khi đi du lịch nước ngoài.', icon: 'flight_takeoff', totalCards: 32, learnedCards: 8, tone: 'from-orange-100 to-orange-200 text-[#e85d04]' },
  { id: 'daily', title: 'Daily Life', description: 'Từ vựng giao tiếp hằng ngày cơ bản.', icon: 'local_cafe', totalCards: 85, learnedCards: 31, tone: 'from-violet-100 to-violet-200 text-tertiary' },
  { id: 'academic', title: 'Academic Vocabulary', description: 'Từ vựng học thuật dành cho IELTS/TOEFL.', icon: 'school', totalCards: 120, learnedCards: 45, tone: 'from-red-100 to-red-200 text-error' },
  { id: 'food', title: 'Food & Dining', description: 'Từ vựng về món ăn, nhà hàng và nấu nướng.', icon: 'restaurant', totalCards: 28, learnedCards: 9, tone: 'from-yellow-100 to-yellow-200 text-[#b77900]' },
]

export const flashcards: Flashcard[] = [
  { id: 'algorithm', topicId: 'technology', term: 'Algorithm', ipa: '/ˈæl.ɡə.rɪ.ðəm/', partOfSpeech: 'Noun', definition: 'A set of steps for solving a problem.', example: 'The search algorithm finds results quickly.', status: 'learned' },
  { id: 'database', topicId: 'technology', term: 'Database', ipa: '/ˈdeɪ.tə.beɪs/', partOfSpeech: 'Noun', definition: 'An organized collection of data.', example: 'Customer information is stored in a database.', status: 'unlearned' },
  { id: 'encryption', topicId: 'technology', term: 'Encryption', ipa: '/ɪnˈkrɪp.ʃən/', partOfSpeech: 'Noun', definition: 'The process of protecting information by coding it.', example: 'Encryption keeps messages private.', status: 'unlearned' },
  { id: 'hardware', topicId: 'technology', term: 'Hardware', ipa: '/ˈhɑːrd.wer/', partOfSpeech: 'Noun', definition: 'Physical computer equipment.', example: 'The keyboard is a piece of hardware.', status: 'learned' },
  { id: 'bandwidth', topicId: 'technology', term: 'Bandwidth', ipa: '/ˈbænd.wɪdθ/', partOfSpeech: 'Noun', definition: 'The amount of data that can be sent through a connection.', example: 'Video calls need high bandwidth.', status: 'unlearned' },
  { id: 'optimize', topicId: 'technology', term: 'Optimize', ipa: '/ˈɑːp.tə.maɪz/', partOfSpeech: 'Verb', definition: 'To make something work as well as possible.', example: 'We need to optimize the app for mobile users.', status: 'unlearned' },
]

const baseLessons: GrammarLesson[] = [
  {
    id: 'present-simple',
    categoryId: 'basic-tenses',
    title: 'Thì hiện tại đơn',
    description: 'Diễn tả một thói quen, chân lý hoặc sự việc hiển nhiên thường xuyên xảy ra ở hiện tại.',
    difficulty: 'beginner',
    completedExercises: 12,
    totalExercises: 20,
    state: 'inProgress',
    icon: 'schedule',
    theory: {
      usage: ['Diễn tả một thói quen hoặc hành động lặp đi lặp lại ở hiện tại.', 'Diễn tả một chân lý, sự thật hiển nhiên.', 'Lịch trình, thời gian biểu cố định.'],
      formulas: [
        { label: 'Khẳng định (+)', value: 'S + V(s/es) + O', tone: 'primary' },
        { label: 'Phủ định (-)', value: 'S + do/does + not + V + O', tone: 'error' },
        { label: 'Nghi vấn (?)', value: 'Do/Does + S + V + O?', tone: 'warning' },
      ],
      signalWords: ['always', 'usually', 'often', 'sometimes', 'rarely', 'never', 'every day/week...'],
    },
    examples: [
      { text: 'He plays tennis every Sunday.', note: 'Anh ấy chơi tennis vào mỗi Chủ nhật. - Chỉ thói quen', tone: 'primary' },
      { text: 'Water boils at 100 degrees Celsius.', note: 'Nước sôi ở 100 độ C. - Chỉ sự thật hiển nhiên', tone: 'success' },
      { text: "They do not (don't) like spicy food.", note: 'Họ không thích đồ ăn cay. - Dạng phủ định', tone: 'error' },
    ],
    questions: [
      { id: 'ps-1', prompt: 'Chọn đáp án đúng để hoàn thành câu: She ___ to school every day.', options: ['go', 'goes', 'going', 'is go'], answer: 'goes' },
      { id: 'ps-2', prompt: 'Chọn đáp án đúng để hoàn thành câu: They ___ eat meat because they are vegetarians.', options: ["don't", "doesn't", "aren't", "isn't"], answer: "don't" },
      { id: 'ps-3', prompt: 'Chọn đáp án đúng để hoàn thành câu: ___ you like playing football?', options: ['Do', 'Does', 'Are', 'Is'], answer: 'Do' },
    ],
  },
  { id: 'past-simple', categoryId: 'basic-tenses', title: 'Thì quá khứ đơn', description: 'Cách sử dụng động từ có quy tắc và bất quy tắc để diễn tả hành động đã kết thúc.', difficulty: 'beginner', completedExercises: 5, totalExercises: 15, state: 'inProgress', icon: 'history' },
  { id: 'present-perfect', categoryId: 'basic-tenses', title: 'Thì hiện tại hoàn thành', description: 'Diễn tả hành động bắt đầu trong quá khứ, kéo dài đến hiện tại.', difficulty: 'intermediate', completedExercises: 0, totalExercises: 18, state: 'notStarted', icon: 'update' },
  { id: 'future-simple', categoryId: 'basic-tenses', title: 'Thì tương lai đơn', description: 'Sử dụng Will/Shall để đưa ra dự đoán, lời hứa hoặc quyết định ngay tại thời điểm nói.', difficulty: 'beginner', completedExercises: 0, totalExercises: 12, state: 'notStarted', icon: 'fast_forward' },
  { id: 'present-continuous', categoryId: 'basic-tenses', title: 'Thì hiện tại tiếp diễn', description: 'Diễn tả hành động đang xảy ra tại thời điểm nói hoặc một kế hoạch đã định.', difficulty: 'beginner', completedExercises: 15, totalExercises: 15, state: 'completed', icon: 'sync' },
]

export const grammarSections: GrammarSection[] = [
  { id: 'basic-tenses', title: 'Các thì cơ bản', markerClass: 'bg-primary', lessons: baseLessons.slice(0, 3) },
  {
    id: 'complex-sentences',
    title: 'Cấu trúc câu phức',
    markerClass: 'bg-orange-700',
    lessons: [
      { id: 'if-structures', categoryId: 'complex-sentences', title: 'Câu điều kiện (If structures)', description: 'Nắm vững câu điều kiện loại 1, 2, 3 và câu điều kiện hỗn hợp.', difficulty: 'advanced', completedExercises: 15, totalExercises: 25, state: 'inProgress', icon: 'alt_route' },
      { id: 'relative-clauses', categoryId: 'complex-sentences', title: 'Mệnh đề quan hệ', description: 'Sử dụng Who, Whom, Which, That để kết nối các ý tưởng trong câu.', difficulty: 'intermediate', completedExercises: 8, totalExercises: 12, state: 'inProgress', icon: 'link' },
    ],
  },
  {
    id: 'parts-of-speech',
    title: 'Từ loại (Parts of Speech)',
    markerClass: 'bg-outline',
    lessons: [
      { id: 'nouns-pronouns', categoryId: 'parts-of-speech', title: 'Danh từ & Đại từ', description: 'Cách phân biệt danh từ đếm được, không đếm được và cách dùng đại từ.', difficulty: 'beginner', completedExercises: 10, totalExercises: 10, state: 'completed', icon: 'label' },
      { id: 'adjectives-adverbs', categoryId: 'parts-of-speech', title: 'Tính từ & Trạng từ', description: 'Cách bổ trợ ý nghĩa cho câu bằng các tính từ và trạng từ mô tả.', difficulty: 'beginner', completedExercises: 4, totalExercises: 20, state: 'inProgress', icon: 'style' },
    ],
  },
]

export function getFlashcardTopics() {
  return flashcardTopics
}

export function getFlashcardTopic(topicId: string) {
  return flashcardTopics.find((topic) => topic.id === topicId)
}

export function getFlashcardsByTopic(topicId: string) {
  return flashcards.filter((card) => card.topicId === topicId)
}

export function getGrammarSections() {
  return grammarSections
}

export function getGrammarCategory(categoryId: string) {
  return grammarSections.find((section) => section.id === categoryId)
}

export function getGrammarLesson(categoryId: string, lessonId: string) {
  return grammarSections.flatMap((section) => section.lessons).find((lesson) => lesson.categoryId === categoryId && lesson.id === lessonId)
}

export function getFlashcardParams() {
  return flashcardTopics.map((topic) => ({ topicId: topic.id }))
}

export function getGrammarCategoryParams() {
  return grammarSections.map((section) => ({ categoryId: section.id }))
}

export function getGrammarLessonParams() {
  return grammarSections.flatMap((section) => section.lessons.map((lesson) => ({ categoryId: lesson.categoryId, lessonId: lesson.id })))
}
