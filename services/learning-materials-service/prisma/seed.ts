import { PrismaClient } from './generated/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding learning materials...');

  // --- Modules ---
  const modReading = await prisma.module.upsert({
    where: { id: 'mod-reading-a2' },
    update: {},
    create: {
      id: 'mod-reading-a2',
      title: 'Reading Fundamentals',
      description: 'Build core reading skills through short texts and everyday topics.',
      cefrLevel: 'A2',
      skillFocus: 'reading',
      order: 1,
    },
  });

  const modWriting = await prisma.module.upsert({
    where: { id: 'mod-writing-b1' },
    update: {},
    create: {
      id: 'mod-writing-b1',
      title: 'Writing Essentials',
      description: 'Develop clear sentence and paragraph writing for practical situations.',
      cefrLevel: 'B1',
      skillFocus: 'writing',
      order: 2,
    },
  });

  const modListening = await prisma.module.upsert({
    where: { id: 'mod-listening-a2' },
    update: {},
    create: {
      id: 'mod-listening-a2',
      title: 'Listening Skills',
      description: 'Understand everyday spoken English in familiar contexts.',
      cefrLevel: 'A2',
      skillFocus: 'listening',
      order: 3,
    },
  });

  // --- Lessons for Reading module ---
  const lesR1 = await prisma.lesson.upsert({
    where: { id: 'les-r1' },
    update: {},
    create: {
      id: 'les-r1',
      moduleId: modReading.id,
      title: 'Reading Short Texts',
      content: { introduction: 'Practice reading short paragraphs about daily life.' },
      order: 1,
    },
  });

  const lesR2 = await prisma.lesson.upsert({
    where: { id: 'les-r2' },
    update: {},
    create: {
      id: 'les-r2',
      moduleId: modReading.id,
      title: 'Understanding Context',
      content: { introduction: 'Use surrounding words to infer meaning of unknown words.' },
      order: 2,
    },
  });

  const lesR3 = await prisma.lesson.upsert({
    where: { id: 'les-r3' },
    update: {},
    create: {
      id: 'les-r3',
      moduleId: modReading.id,
      title: 'Finding Main Ideas',
      content: { introduction: 'Identify the main idea and supporting details in a passage.' },
      order: 3,
    },
  });

  // --- Lessons for Writing module ---
  const lesW1 = await prisma.lesson.upsert({
    where: { id: 'les-w1' },
    update: {},
    create: {
      id: 'les-w1',
      moduleId: modWriting.id,
      title: 'Writing Complete Sentences',
      content: { introduction: 'Form grammatically correct sentences using subject + verb + object.' },
      order: 1,
    },
  });

  const lesW2 = await prisma.lesson.upsert({
    where: { id: 'les-w2' },
    update: {},
    create: {
      id: 'les-w2',
      moduleId: modWriting.id,
      title: 'Paragraph Structure',
      content: { introduction: 'Organise ideas into clear paragraphs with a topic sentence.' },
      order: 2,
    },
  });

  const lesW3 = await prisma.lesson.upsert({
    where: { id: 'les-w3' },
    update: {},
    create: {
      id: 'les-w3',
      moduleId: modWriting.id,
      title: 'Email Writing',
      content: { introduction: 'Write simple formal and informal emails.' },
      order: 3,
    },
  });

  // --- Lessons for Listening module ---
  const lesL1 = await prisma.lesson.upsert({
    where: { id: 'les-l1' },
    update: {},
    create: {
      id: 'les-l1',
      moduleId: modListening.id,
      title: 'Listening for Gist',
      content: { introduction: 'Get the general meaning of short spoken passages.' },
      order: 1,
    },
  });

  const lesL2 = await prisma.lesson.upsert({
    where: { id: 'les-l2' },
    update: {},
    create: {
      id: 'les-l2',
      moduleId: modListening.id,
      title: 'Listening for Details',
      content: { introduction: 'Identify specific information in conversations and announcements.' },
      order: 2,
    },
  });

  const lesL3 = await prisma.lesson.upsert({
    where: { id: 'les-l3' },
    update: {},
    create: {
      id: 'les-l3',
      moduleId: modListening.id,
      title: 'Everyday Conversations',
      content: { introduction: 'Understand informal dialogues on common topics.' },
      order: 3,
    },
  });

  // --- Exercises (3 per lesson) ---
  const exerciseDefs = [
    // Reading lesson 1
    {
      id: 'ex-r1-1', lessonId: lesR1.id, type: 'mcq', skill: 'reading', difficulty: 'easy',
      prompt: { passage: 'Maria goes to the market every Saturday to buy fresh vegetables.', question: 'When does Maria go to the market?' },
      answerKey: { answer: 'Every Saturday' },
    },
    {
      id: 'ex-r1-2', lessonId: lesR1.id, type: 'mcq', skill: 'reading', difficulty: 'easy',
      prompt: { passage: 'The library opens at 9 AM and closes at 6 PM on weekdays.', question: 'What time does the library close on weekdays?', options: ['5 PM', '6 PM', '7 PM', '8 PM'] },
      answerKey: { answer: '6 PM' },
    },
    {
      id: 'ex-r1-3', lessonId: lesR1.id, type: 'mcq', skill: 'reading', difficulty: 'easy',
      prompt: { passage: 'Tom is a doctor. He works at City Hospital and helps sick people every day.', question: 'Where does Tom work?', options: ['City School', 'City Hospital', 'City Hall', 'City Bank'] },
      answerKey: { answer: 'City Hospital' },
    },
    // Reading lesson 2
    {
      id: 'ex-r2-1', lessonId: lesR2.id, type: 'mcq', skill: 'reading', difficulty: 'medium',
      prompt: { sentence: 'The hikers were exhausted after climbing the steep mountain trail.', question: 'What does "exhausted" most likely mean?', options: ['Very tired', 'Very happy', 'Very hungry', 'Very cold'] },
      answerKey: { answer: 'Very tired' },
    },
    {
      id: 'ex-r2-2', lessonId: lesR2.id, type: 'sentence-correction', skill: 'reading', difficulty: 'medium',
      prompt: { sentence: 'She borrowed a book from the library and return it next week.', instruction: 'Find and correct the error.' },
      answerKey: { answer: 'She borrowed a book from the library and will return it next week.' },
    },
    {
      id: 'ex-r2-3', lessonId: lesR2.id, type: 'mcq', skill: 'reading', difficulty: 'medium',
      prompt: { sentence: 'The restaurant was packed on Friday evening.', question: 'What does "packed" most likely mean here?', options: ['Closed', 'Very full', 'Very clean', 'Very quiet'] },
      answerKey: { answer: 'Very full' },
    },
    // Reading lesson 3
    {
      id: 'ex-r3-1', lessonId: lesR3.id, type: 'mcq', skill: 'reading', difficulty: 'medium',
      prompt: { passage: 'Recycling helps protect the environment. When we recycle paper, plastic, and glass, we reduce waste and save natural resources. Many cities now have special bins for different types of recyclable materials.', question: 'What is the main idea of this passage?', options: ['Cities have special bins', 'Recycling helps the environment', 'Paper and plastic are waste', 'Natural resources are expensive'] },
      answerKey: { answer: 'Recycling helps the environment' },
    },
    {
      id: 'ex-r3-2', lessonId: lesR3.id, type: 'mcq', skill: 'reading', difficulty: 'medium',
      prompt: { passage: 'Regular exercise has many benefits. It helps maintain a healthy weight, strengthens the heart, and improves mood. Experts recommend at least 30 minutes of activity most days.', question: 'Which of the following is NOT mentioned as a benefit of exercise?', options: ['Healthy weight', 'Stronger heart', 'Better sleep', 'Improved mood'] },
      answerKey: { answer: 'Better sleep' },
    },
    {
      id: 'ex-r3-3', lessonId: lesR3.id, type: 'mcq', skill: 'reading', difficulty: 'hard',
      prompt: { passage: 'Despite the heavy rain, the outdoor concert continued. The organisers had prepared large tents in advance to shelter the audience.', question: 'Why was the concert not cancelled?', options: ['The rain was light', 'Tents were set up for shelter', 'The audience left early', 'The concert was moved indoors'] },
      answerKey: { answer: 'Tents were set up for shelter' },
    },
    // Writing lesson 1
    {
      id: 'ex-w1-1', lessonId: lesW1.id, type: 'sentence-correction', skill: 'writing', difficulty: 'easy',
      prompt: { sentence: 'Yesterday I go to the market.', instruction: 'Correct the grammatical error.' },
      answerKey: { answer: 'Yesterday I went to the market.' },
    },
    {
      id: 'ex-w1-2', lessonId: lesW1.id, type: 'fill-blank', skill: 'writing', difficulty: 'easy',
      prompt: { sentence: 'She ___ (write) a letter right now.', instruction: 'Fill in the blank with the correct form of the verb.' },
      answerKey: { answer: 'is writing' },
    },
    {
      id: 'ex-w1-3', lessonId: lesW1.id, type: 'sentence-correction', skill: 'writing', difficulty: 'easy',
      prompt: { sentence: 'He don\'t like coffee in the morning.', instruction: 'Correct the grammatical error.' },
      answerKey: { answer: 'He doesn\'t like coffee in the morning.' },
    },
    // Writing lesson 2
    {
      id: 'ex-w2-1', lessonId: lesW2.id, type: 'fill-blank', skill: 'writing', difficulty: 'medium',
      prompt: { sentence: '___, the weather was cold, but we still enjoyed the picnic.', instruction: 'Choose the best connector: Although / Because / So', options: ['Although', 'Because', 'So'] },
      answerKey: { answer: 'Although' },
    },
    {
      id: 'ex-w2-2', lessonId: lesW2.id, type: 'fill-blank', skill: 'writing', difficulty: 'medium',
      prompt: { sentence: 'The topic sentence of a paragraph states the ___ idea.', instruction: 'Fill in the blank.', options: ['main', 'last', 'hidden', 'shortest'] },
      answerKey: { answer: 'main' },
    },
    {
      id: 'ex-w2-3', lessonId: lesW2.id, type: 'sentence-correction', skill: 'writing', difficulty: 'medium',
      prompt: { sentence: 'In conclusion, exercise are very important for health.', instruction: 'Correct the grammatical error.' },
      answerKey: { answer: 'In conclusion, exercise is very important for health.' },
    },
    // Writing lesson 3
    {
      id: 'ex-w3-1', lessonId: lesW3.id, type: 'fill-blank', skill: 'writing', difficulty: 'medium',
      prompt: { sentence: 'I am writing to ___ about the delayed order.', instruction: 'Choose the most appropriate word.', options: ['complain', 'congratulate', 'invite', 'remind'] },
      answerKey: { answer: 'complain' },
    },
    {
      id: 'ex-w3-2', lessonId: lesW3.id, type: 'fill-blank', skill: 'writing', difficulty: 'medium',
      prompt: { sentence: 'Please ___ the attached document for your reference.', instruction: 'Fill in the blank.', options: ['find', 'see', 'look', 'read'] },
      answerKey: { answer: 'find' },
    },
    {
      id: 'ex-w3-3', lessonId: lesW3.id, type: 'sentence-correction', skill: 'writing', difficulty: 'hard',
      prompt: { sentence: 'I look forward to hear from you soon.', instruction: 'Correct the grammatical error.' },
      answerKey: { answer: 'I look forward to hearing from you soon.' },
    },
    // Listening lesson 1
    {
      id: 'ex-l1-1', lessonId: lesL1.id, type: 'listening-comprehension', skill: 'listening', difficulty: 'easy',
      prompt: { transcript: 'Good morning. This is a reminder that the office will be closed on Monday for the public holiday. Normal hours resume on Tuesday.', question: 'What is the main purpose of this message?', options: ['To announce a new schedule', 'To remind about a holiday closure', 'To cancel a meeting', 'To change office hours'], audioKey: null },
      answerKey: { answer: 'To remind about a holiday closure' },
    },
    {
      id: 'ex-l1-2', lessonId: lesL1.id, type: 'listening-comprehension', skill: 'listening', difficulty: 'easy',
      prompt: { transcript: 'Hi Anna, it\'s Ben. I just wanted to check if we\'re still on for dinner tonight at 7. Let me know!', question: 'What is Ben calling about?', options: ['To cancel dinner', 'To confirm dinner plans', 'To change the time', 'To invite a new guest'], audioKey: null },
      answerKey: { answer: 'To confirm dinner plans' },
    },
    {
      id: 'ex-l1-3', lessonId: lesL1.id, type: 'listening-comprehension', skill: 'listening', difficulty: 'easy',
      prompt: { transcript: 'The train to London departs at 14:30 from platform 3. Please ensure you have your ticket ready for inspection.', question: 'What is the general topic of this announcement?', options: ['A flight departure', 'A train departure', 'A bus schedule', 'A platform change'], audioKey: null },
      answerKey: { answer: 'A train departure' },
    },
    // Listening lesson 2
    {
      id: 'ex-l2-1', lessonId: lesL2.id, type: 'listening-comprehension', skill: 'listening', difficulty: 'medium',
      prompt: { transcript: 'The train arrives at 3 PM. The station is located downtown, next to the central park.', question: 'When does the train arrive?', options: ['2 PM', '3 PM', '4 PM', '5 PM'], audioKey: null },
      answerKey: { answer: '3 PM' },
    },
    {
      id: 'ex-l2-2', lessonId: lesL2.id, type: 'listening-comprehension', skill: 'listening', difficulty: 'medium',
      prompt: { transcript: 'Your order number is 4521. It will be delivered between 2 PM and 4 PM tomorrow.', question: 'What is the order number?', options: ['2154', '4521', '5124', '1254'], audioKey: null },
      answerKey: { answer: '4521' },
    },
    {
      id: 'ex-l2-3', lessonId: lesL2.id, type: 'listening-comprehension', skill: 'listening', difficulty: 'medium',
      prompt: { transcript: 'The meeting has been moved from Room 5 to Room 12 on the third floor due to maintenance work.', question: 'Where will the meeting now take place?', options: ['Room 5, second floor', 'Room 12, third floor', 'Room 5, third floor', 'Room 12, second floor'], audioKey: null },
      answerKey: { answer: 'Room 12, third floor' },
    },
    // Listening lesson 3
    {
      id: 'ex-l3-1', lessonId: lesL3.id, type: 'listening-comprehension', skill: 'listening', difficulty: 'medium',
      prompt: { transcript: 'A: Excuse me, do you know where the nearest pharmacy is? B: Sure, go straight down this street, turn left at the traffic lights, and it\'s on your right.', question: 'Where is the pharmacy?', options: ['Turn right, then left', 'Straight, turn left, on the right', 'Straight, turn right, on the left', 'Second street on the left'], audioKey: null },
      answerKey: { answer: 'Straight, turn left, on the right' },
    },
    {
      id: 'ex-l3-2', lessonId: lesL3.id, type: 'listening-comprehension', skill: 'listening', difficulty: 'medium',
      prompt: { transcript: 'A: What would you like to order? B: I\'ll have the chicken pasta, please. And a glass of water. A: Of course. Anything for dessert? B: No, thank you.', question: 'What did the customer order to drink?', options: ['Coffee', 'Juice', 'Water', 'Tea'], audioKey: null },
      answerKey: { answer: 'Water' },
    },
    {
      id: 'ex-l3-3', lessonId: lesL3.id, type: 'listening-comprehension', skill: 'listening', difficulty: 'hard',
      prompt: { transcript: 'A: I\'m thinking of taking a gap year before university. B: That sounds interesting. What would you do? A: Travel through Southeast Asia, maybe volunteer at a school. B: Have you told your parents? A: Not yet. I\'m a bit nervous about their reaction.', question: 'Why is the speaker nervous?', options: ["They haven't planned their trip", "They haven't told their parents yet", 'They are afraid of travelling', 'They cannot afford the trip'], audioKey: null },
      answerKey: { answer: "They haven't told their parents yet" },
    },
  ];

  for (const def of exerciseDefs) {
    await prisma.exercise.upsert({
      where: { id: def.id },
      update: {},
      create: def,
    });
  }

  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
