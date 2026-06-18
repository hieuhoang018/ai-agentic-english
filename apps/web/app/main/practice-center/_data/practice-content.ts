import type { PracticeLesson, PracticeModule, PracticeSkill, PracticeSkillId } from '../_types/practice'
import { modulePath, skillPath } from '../_utils/routes'

export const practiceSkills: PracticeSkill[] = [
  {
    id: 'reading',
    title: 'Luyện Đọc',
    shortTitle: 'Đọc',
    icon: 'menu_book',
    description: 'Xây nền từ vựng, tốc độ đọc và khả năng nắm ý chính qua các đoạn văn ngắn.',
    progressPercent: 60,
    href: skillPath('reading'),
    tone: 'blue',
  },
  {
    id: 'listening',
    title: 'Luyện Nghe',
    shortTitle: 'Nghe',
    icon: 'headphones',
    description: 'Luyện nhận diện âm thanh, ngữ điệu và ý chính trong hội thoại hằng ngày.',
    progressPercent: 45,
    href: skillPath('listening'),
    tone: 'green',
  },
  {
    id: 'writing',
    title: 'Luyện Viết',
    shortTitle: 'Viết',
    icon: 'edit',
    description: 'Rèn ngữ pháp, liên kết câu và cách trình bày ý tưởng rõ ràng.',
    progressPercent: 30,
    href: skillPath('writing'),
    tone: 'blue',
  },
]

const modules: Record<PracticeSkillId, PracticeModule[]> = {
  reading: [
    {
      id: 'module-1',
      skill: 'reading',
      order: 1,
      title: 'Foundations',
      subtitle: 'Skimming and Scanning Techniques',
      description: 'Basic sentence structures, common vocabulary, and introductory reading passages.',
      status: 'completed',
      progressPercent: 100,
      lessonsTotal: 10,
      lessonsCompleted: 10,
    },
    {
      id: 'module-2',
      skill: 'reading',
      order: 2,
      title: 'Intermediate Reading',
      subtitle: 'Main Ideas and Inference',
      description: 'Complex paragraphs, identifying main ideas, and inferring meaning from context.',
      status: 'inProgress',
      progressPercent: 60,
      lessonsTotal: 12,
      lessonsCompleted: 7,
    },
    {
      id: 'module-3',
      skill: 'reading',
      order: 3,
      title: 'Advanced Comprehension',
      subtitle: 'Tone and Synthesis',
      description: "Critical thinking, analyzing author's tone, and synthesizing information across multiple texts.",
      status: 'locked',
      progressPercent: 0,
      lessonsTotal: 14,
      lessonsCompleted: 0,
    },
    {
      id: 'module-4',
      skill: 'reading',
      order: 4,
      title: 'Academic Texts',
      subtitle: 'Research and Formal Essays',
      description: 'Navigating research papers, scientific articles, and formal essays with advanced vocabulary.',
      status: 'locked',
      progressPercent: 0,
      lessonsTotal: 12,
      lessonsCompleted: 0,
    },
    {
      id: 'module-5',
      skill: 'reading',
      order: 5,
      title: 'Literature & Prose',
      subtitle: 'Narrative Reading',
      description: 'Exploring fictional narratives, poetry analysis, and understanding figurative language.',
      status: 'locked',
      progressPercent: 0,
      lessonsTotal: 12,
      lessonsCompleted: 0,
    },
  ],
  listening: [
    {
      id: 'module-1',
      skill: 'listening',
      order: 1,
      title: 'Âm cơ bản & Ngữ điệu',
      subtitle: 'Sound Patterns',
      description: 'Basic sentence structures, common vocabulary, and introductory listening passages.',
      status: 'completed',
      progressPercent: 100,
      lessonsTotal: 10,
      lessonsCompleted: 10,
    },
    {
      id: 'module-2',
      skill: 'listening',
      order: 2,
      title: 'Hội thoại hằng ngày',
      subtitle: 'Everyday Dialogues',
      description: 'Complex paragraphs, identifying main ideas, and inferring meaning from context.',
      status: 'inProgress',
      progressPercent: 45,
      lessonsTotal: 12,
      lessonsCompleted: 5,
    },
    {
      id: 'module-3',
      skill: 'listening',
      order: 3,
      title: 'Advanced Comprehension',
      subtitle: 'Fast Speech',
      description: "Critical thinking, analyzing speaker's tone, and synthesizing information across multiple clips.",
      status: 'locked',
      progressPercent: 0,
      lessonsTotal: 14,
      lessonsCompleted: 0,
    },
    {
      id: 'module-4',
      skill: 'listening',
      order: 4,
      title: 'Academic Texts',
      subtitle: 'Lectures and Talks',
      description: 'Navigating lectures, expert talks, and formal audio with advanced vocabulary.',
      status: 'locked',
      progressPercent: 0,
      lessonsTotal: 12,
      lessonsCompleted: 0,
    },
    {
      id: 'module-5',
      skill: 'listening',
      order: 5,
      title: 'Literature & Prose',
      subtitle: 'Storytelling',
      description: 'Understanding fictional narratives, expressive speech, and figurative language.',
      status: 'locked',
      progressPercent: 0,
      lessonsTotal: 12,
      lessonsCompleted: 0,
    },
  ],
  writing: [
    {
      id: 'module-1',
      skill: 'writing',
      order: 1,
      title: 'Cấu trúc câu & Ngữ pháp cơ bản',
      subtitle: 'Sentence Foundations',
      description: 'Nắm vững các quy tắc ngữ pháp và cấu trúc câu nền tảng để viết chính xác.',
      status: 'completed',
      progressPercent: 100,
      lessonsTotal: 10,
      lessonsCompleted: 10,
    },
    {
      id: 'module-2',
      skill: 'writing',
      order: 2,
      title: 'Viết đoạn văn & Cách nối câu',
      subtitle: 'Paragraph Flow',
      description: 'Học cách phát triển ý tưởng thành đoạn văn hoàn chỉnh và sử dụng từ nối hiệu quả.',
      status: 'inProgress',
      progressPercent: 30,
      lessonsTotal: 12,
      lessonsCompleted: 4,
    },
    {
      id: 'module-3',
      skill: 'writing',
      order: 3,
      title: 'Viết Email & Thư tín',
      subtitle: 'Business Correspondence',
      description: 'Kỹ năng viết thư chuyên nghiệp và giao tiếp qua email trong môi trường công việc.',
      status: 'locked',
      progressPercent: 0,
      lessonsTotal: 10,
      lessonsCompleted: 0,
    },
    {
      id: 'module-4',
      skill: 'writing',
      order: 4,
      title: 'Viết luận học thuật (IELTS/TOEFL)',
      subtitle: 'Academic Essays',
      description: 'Phân tích đề bài và triển khai bài luận học thuật đạt chuẩn quốc tế.',
      status: 'locked',
      progressPercent: 0,
      lessonsTotal: 12,
      lessonsCompleted: 0,
    },
    {
      id: 'module-5',
      skill: 'writing',
      order: 5,
      title: 'Sáng tạo nội dung & Blog',
      subtitle: 'Creative Writing',
      description: 'Phát triển phong cách viết cá nhân và sáng tạo nội dung thu hút trên mạng xã hội.',
      status: 'locked',
      progressPercent: 0,
      lessonsTotal: 12,
      lessonsCompleted: 0,
    },
  ],
}

const lessons: Record<string, PracticeLesson> = {
  'reading:module-1': {
    id: 'reading-module-1-lesson-1',
    skill: 'reading',
    moduleId: 'module-1',
    moduleTitle: 'Module 1: Foundations',
    moduleSubtitle: 'Skimming and Scanning Techniques',
    progressPercent: 62,
    questionNumber: 2,
    totalQuestions: 4,
    theory: [
      {
        title: 'Skimming (Đọc lướt)',
        body: 'Là kỹ thuật đọc nhanh để nắm bắt ý chính của đoạn văn mà không cần đọc từng từ. Thường được sử dụng để đọc báo, tìm kiếm thông tin tổng quan.',
      },
      {
        title: 'Scanning (Đọc quét)',
        body: 'Là kỹ thuật tìm kiếm một thông tin cụ thể như ngày tháng, tên riêng hoặc số liệu trong một đoạn văn bản dài.',
      },
    ],
    tip: 'Hãy chú ý đến câu đầu và câu cuối của mỗi đoạn văn, vì chúng thường chứa câu chủ đề.',
    question: {
      id: 'q-reading-1',
      type: 'mcq',
      prompt: 'According to the passage, when were the most famous parts of the Great Wall built?',
      passage:
        'The Great Wall of China is one of the most remarkable architectural feats in human history. Stretching over 13,000 miles, it was built over centuries by various Chinese dynasties to protect against nomadic invasions from the north. The most well-known sections were constructed during the Ming Dynasty (1368-1644). It is not a single continuous wall, but rather a collection of walls and fortifications, some of which are parallel to each other.',
      options: [
        { id: 'a', label: 'Before the Ming Dynasty' },
        { id: 'b', label: 'During the Ming Dynasty (1368-1644)' },
        { id: 'c', label: 'After the Ming Dynasty' },
        { id: 'd', label: "It doesn't mention specific dates." },
      ],
      correctOptionId: 'b',
    },
    feedback: {
      title: 'Mentor feedback',
      message: 'Bạn đã xác định đúng mốc thời gian nhờ scanning theo cụm “Ming Dynasty”.',
      highlights: ['Ming Dynasty', 'well-known sections', 'constructed'],
    },
  },
  'listening:module-1': {
    id: 'listening-module-1-lesson-1',
    skill: 'listening',
    moduleId: 'module-1',
    moduleTitle: 'Module 1: Âm cơ bản & Ngữ điệu',
    moduleSubtitle: 'Recognizing common sounds in short dialogues',
    progressPercent: 54,
    questionNumber: 2,
    totalQuestions: 4,
    theory: [
      {
        title: 'Nghe ý chính',
        body: 'Ở đoạn hội thoại ngắn, hãy nghe cụm từ lặp lại và ngữ điệu nhấn mạnh để xác định mục đích của người nói.',
      },
      {
        title: 'Từ khóa bối cảnh',
        body: 'Các từ chỉ địa điểm như restaurant, office, airport thường giúp bạn đoán nhanh tình huống giao tiếp.',
      },
    ],
    tip: 'Nghe lần đầu để lấy ngữ cảnh, lần hai để bắt thông tin cụ thể.',
    question: {
      id: 'q-listening-1',
      type: 'mcq',
      prompt: 'What does the customer want to do?',
      passage: 'Audio transcript: Good evening. I would like to book a table for two at seven tonight. Do you have any availability?',
      options: [
        { id: 'a', label: 'Order food for delivery' },
        { id: 'b', label: 'Make a restaurant reservation' },
        { id: 'c', label: 'Cancel a booking' },
        { id: 'd', label: 'Ask for the bill' },
      ],
      correctOptionId: 'b',
    },
    feedback: {
      title: 'Listening insight',
      message: 'Cụm “book a table” là dấu hiệu rõ nhất cho hành động đặt bàn.',
      highlights: ['book a table', 'availability', 'reservation'],
    },
  },
  'writing:module-1': {
    id: 'writing-module-1-lesson-1',
    skill: 'writing',
    moduleId: 'module-1',
    moduleTitle: 'Module 1: Cấu trúc câu & Ngữ pháp cơ bản',
    moduleSubtitle: 'Simple sentence patterns for clear writing',
    progressPercent: 72,
    questionNumber: 2,
    totalQuestions: 4,
    theory: [
      {
        title: 'Câu đơn rõ nghĩa',
        body: 'Một câu cơ bản cần có chủ ngữ và động từ chính. Với người mới học, ưu tiên câu ngắn, đúng thì và đúng trật tự từ.',
      },
      {
        title: 'Mở rộng câu',
        body: 'Sau khi có câu lõi, thêm thời gian, địa điểm hoặc lý do để câu tự nhiên hơn.',
      },
    ],
    tip: 'Viết câu ngắn trước, sau đó kiểm tra chủ ngữ, động từ và thì.',
    question: {
      id: 'q-writing-1',
      type: 'writingPrompt',
      prompt: 'Write 3-4 sentences introducing your daily work routine.',
      context: 'Use present simple tense and include at least one time expression.',
      placeholder: 'Example: I start work at 9 AM. I usually check my email first...',
    },
    feedback: {
      title: 'Writing feedback preview',
      message: 'AI sẽ kiểm tra thì hiện tại đơn, thứ tự từ và gợi ý cách nối câu tự nhiên hơn.',
      highlights: ['present simple', 'time expression', 'sentence order'],
    },
  },
}

export function isPracticeSkillId(value: string): value is PracticeSkillId {
  return value === 'reading' || value === 'listening' || value === 'writing'
}

export async function getPracticeSkills() {
  return practiceSkills
}

export async function getSkillModules(skill: PracticeSkillId) {
  return modules[skill]
}

export async function getSkillConfig(skill: PracticeSkillId) {
  return practiceSkills.find((item) => item.id === skill)
}

export async function getPracticeLesson(skill: PracticeSkillId, moduleId: string) {
  return lessons[`${skill}:${moduleId}`] ?? lessons[`${skill}:module-1`]
}

export function getAllModuleParams() {
  return Object.values(modules).flatMap((skillModules) =>
    skillModules.map((module) => ({
      skill: module.skill,
      moduleId: module.id,
    })),
  )
}

export function getModuleHref(module: PracticeModule) {
  return modulePath(module.skill, module.id)
}
