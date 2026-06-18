import type { ConversationDetail, ConversationSummary } from '../_types/speaking'

export const currentSpeakingSession: ConversationDetail = {
  id: 'restaurant-reservation',
  title: 'Đặt bàn nhà hàng',
  topic: 'Đặt bàn nhà hàng (Restaurant Reservation)',
  date: '24/05/2024',
  time: '10:02',
  durationMinutes: 12,
  status: 'complete',
  accuracyPercent: 92,
  goals: [
    { id: 'greeting', label: 'Chào hỏi và hỏi bàn (Greeting & requesting a table)', completed: true },
    { id: 'details', label: 'Cung cấp thông tin đặt bàn (Giving reservation details)', completed: false },
    { id: 'requests', label: 'Yêu cầu đặc biệt (Special requests)', completed: false },
  ],
  vocabularySuggestions: ['make a reservation', 'book a table', 'available', 'fully booked', 'under the name of...'],
  analysis: {
    pronunciation: 95,
    vocabulary: 88,
    grammar: 75,
    vocabularyNote: 'Sử dụng từ vựng tốt, có thể cân nhắc thêm idiom để tự nhiên hơn.',
    grammarNote: 'Cần chú ý hơn về thì Present Perfect Continuous.',
  },
  messages: [
    {
      id: 'm1',
      speaker: 'ai',
      content: 'Hello! Welcome to The Golden Spoon. How can I assist you today? Would you like to make a reservation?',
      timestamp: '10:02 AM',
    },
    {
      id: 'm2',
      speaker: 'user',
      content: 'Yes, I would like to book a table for two people tonight at 7 PM.',
      timestamp: '10:03 AM',
      note: 'Excellent pronunciation!',
    },
    {
      id: 'm3',
      speaker: 'ai',
      content: 'Perfect. A table for two at 7:00 PM tonight. May I have your name for the reservation, please?',
      timestamp: '10:03 AM',
    },
  ],
}

export const conversationDetails: ConversationDetail[] = [
  {
    ...currentSpeakingSession,
    id: 'personal-hobbies',
    title: 'Thảo luận về sở thích cá nhân',
    topic: 'Personal hobbies',
    date: '24/05/2024',
    time: '14:30',
    durationMinutes: 12,
    status: 'perfect',
    accuracyPercent: 92,
    messages: [
      {
        id: 'h1',
        speaker: 'ai',
        content: "Hello! Let's talk about your hobbies. What do you usually do in your free time?",
      },
      {
        id: 'h2',
        speaker: 'user',
        content: 'In my free time, I really enjoy reading science fiction books and playing the guitar.',
        note: 'Perfect',
      },
      {
        id: 'h3',
        speaker: 'ai',
        content: 'That sounds wonderful! Sci-fi can be very imaginative. How long have you been playing the guitar?',
      },
      {
        id: 'h4',
        speaker: 'user',
        content: 'I play guitar since five years ago.',
        correction: {
          title: 'Grammar Suggestion',
          issue: 'Instead of “I play guitar since five years ago”, use the present perfect continuous tense.',
          suggestion: 'I have been playing guitar for five years.',
        },
      },
      {
        id: 'h5',
        speaker: 'ai',
        content: 'Five years is a great commitment! Do you prefer playing acoustic or electric guitar?',
      },
    ],
  },
  {
    ...currentSpeakingSession,
    id: 'restaurant-ordering',
    title: 'Tại nhà hàng: Gọi món',
    date: '24/05/2024',
    time: '09:15',
    durationMinutes: 8,
    status: 'complete',
    accuracyPercent: 84,
  },
  {
    ...currentSpeakingSession,
    id: 'mock-interview',
    title: 'Phỏng vấn xin việc (Mock Interview)',
    date: '23/05/2024',
    time: '16:45',
    durationMinutes: 25,
    status: 'needsWork',
    accuracyPercent: 71,
  },
  {
    ...currentSpeakingSession,
    id: 'travel-culture',
    title: 'Chủ đề: Du lịch và Văn hóa',
    date: '20/05/2024',
    time: '11:20',
    durationMinutes: 15,
    status: 'perfect',
    accuracyPercent: 90,
  },
]

export async function getCurrentSpeakingSession() {
  return currentSpeakingSession
}

export async function getConversationHistory(): Promise<ConversationSummary[]> {
  return conversationDetails.map(({ id, title, date, time, durationMinutes, status, accuracyPercent }) => ({
    id,
    title,
    date,
    time,
    durationMinutes,
    status,
    accuracyPercent,
  }))
}

export async function getConversationDetail(conversationId: string) {
  return conversationDetails.find((conversation) => conversation.id === conversationId)
}
