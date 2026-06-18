@AGENTS.md

# Practice Center UI Implementation Plan

## Summary
Build the Practice Center first as a polished, responsive Next.js UI matching the provided designs, using typed mock data now and a clean data boundary for backend integration later. Prioritize Reading, Listening, Writing module lists, shared exercise flow, Speaking chat, conversation history, and transcript feedback.

Current frontend state:
- Next.js App Router lives in `apps/web/app`.
- Shared shell exists in `apps/web/app/main/layout.tsx`.
- Sidebar exists in `apps/web/app/components/SideMenu.tsx`.
- Practice Center currently has only one placeholder page.
- Backend services for learning materials, AI tutor, and memory/progress currently expose health checks only, so Practice Center UI should start with mock data/adapters.

## Key Changes

1. Normalize the app shell
- Keep `apps/web/app/main/layout.tsx` as the authenticated dashboard shell.
- Add a reusable dashboard top bar with breadcrumbs, back button, notification, and settings icons.
- Fix mojibake Vietnamese copy in existing UI files.
- Keep Material Symbols for icons because the project already loads that font; do not add a new icon dependency for v1.

2. Create Practice Center route structure

```txt
apps/web/app/main/practice-center/
  page.tsx
  reading/page.tsx
  listening/page.tsx
  writing/page.tsx
  speaking/page.tsx
  speaking/history/page.tsx
  speaking/history/[conversationId]/page.tsx
  [skill]/modules/[moduleId]/page.tsx
```

Route behavior:
- `/practice-center`: skill hub with Reading, Listening, Writing, Speaking cards.
- `/practice-center/reading`: Reading module list matching `Luyện đọc.png`.
- `/practice-center/listening`: Listening module list matching `Luyện nghe.png`.
- `/practice-center/writing`: Writing module list matching `Luyện viết.png`.
- `/practice-center/[skill]/modules/[moduleId]`: shared exercise runner matching `Bài tập.png`; supports reading/listening/writing variants through data.
- `/practice-center/speaking`: AI conversation UI matching `Luyện nói.png`.
- `/practice-center/speaking/history`: conversation list matching `Lịch sử hội thoại.png`.
- `/practice-center/speaking/history/[conversationId]`: transcript/analysis view matching `Transcript.png`.

3. Add Practice Center UI architecture

```txt
apps/web/app/main/practice-center/
  _components/
    PracticeHero.tsx
    SkillCard.tsx
    ModuleCard.tsx
    ModuleList.tsx
    ExerciseWorkspace.tsx
    TheoryPanel.tsx
    QuestionPanel.tsx
    AnswerOption.tsx
    ProgressBar.tsx
    BreadcrumbBar.tsx
    SpeakingChat.tsx
    SpeakingSidebar.tsx
    ConversationHistoryList.tsx
    TranscriptThread.tsx
    FeedbackInsightCard.tsx
  _data/
    practice-content.ts
    speaking-content.ts
  _types/
    practice.ts
    speaking.ts
  _utils/
    progress.ts
    routes.ts
```

Component rules:
- `ModuleCard` handles `completed`, `inProgress`, and `locked` states.
- `ExerciseWorkspace` handles the two-column lesson layout: theory on the left, practice question on the right.
- `QuestionPanel` supports `mcq`, `shortAnswer`, and `writingPrompt` types, even if v1 only renders MCQ and writing textarea.
- `SpeakingChat` owns local input/recording UI state only; mock conversation data remains in `_data`.
- `TranscriptThread` renders AI/user bubbles plus inline correction cards.
- `ProgressBar` is shared across module cards, lesson progress, and skill progress.

4. Define typed UI data contracts

Create `PracticeSkill`, `PracticeModule`, `PracticeLesson`, `PracticeQuestion`, and `PracticeFeedback` in `_types/practice.ts`.

Core shape:
```ts
type PracticeSkillId = 'reading' | 'listening' | 'writing'

type ModuleStatus = 'completed' | 'inProgress' | 'locked'

type QuestionType = 'mcq' | 'shortAnswer' | 'writingPrompt'

interface PracticeModule {
  id: string
  skill: PracticeSkillId
  order: number
  title: string
  description: string
  status: ModuleStatus
  progressPercent: number
  lessonsTotal: number
  lessonsCompleted: number
}
```

Create speaking-specific types in `_types/speaking.ts`:
```ts
type ConversationStatus = 'perfect' | 'complete' | 'needsWork'

interface ConversationSummary {
  id: string
  title: string
  date: string
  durationMinutes: number
  status: ConversationStatus
  accuracyPercent: number
}
```

5. Implement visual system refinements
- Use the existing token names in `globals.css`, but add small utilities only when repeated UI needs them.
- Keep cards at `8px` radius where possible to match the designs.
- Use white/surface panels, blue primary actions, green completed states, gray locked states.
- Avoid decorative gradient/orb backgrounds inside Practice Center.
- Make module pages responsive:
  - Desktop: sidebar + wide content, module cards full-width.
  - Tablet/mobile: cards stack, exercise theory/practice stack vertically, speaking side panels move below chat.
- Ensure all buttons have stable height and text does not resize layout.

## Step-By-Step Build Order

1. Foundation pass
- Fix existing Vietnamese copy in `SideMenu`, homepage, and current Practice Center placeholder.
- Extract dashboard breadcrumbs/top-bar behavior from `main/layout.tsx` into a reusable component.
- Update Practice Center sidebar active logic to include all new child routes.

2. Practice Center hub
- Replace placeholder `/practice-center/page.tsx` with four skill cards.
- Cards route to Reading, Listening, Writing, and Speaking.
- Include concise progress/CTA states, but no backend dependency.

3. Reading, Listening, Writing module list pages
- Build shared `ModuleList` and `ModuleCard`.
- Create skill-specific page config for title, icon, description, module titles, progress, and CTA labels.
- Match the provided module-list designs:
  - completed card: green top border, Review action
  - in-progress card: blue top border, Continue action
  - locked card: gray disabled visual and Locked action

4. Shared exercise page
- Implement `/practice-center/[skill]/modules/[moduleId]/page.tsx`.
- Render breadcrumb: `Trung tâm thực hành > Luyện Đọc/Nghe/Viết > Module N`.
- Render module title, subtitle, lesson progress, theory panel, question panel, answer options, back/continue buttons.
- For v1, answer selection is client-side only and shows selected state; AI grading/feedback is represented by mock feedback after submit.

5. Speaking page
- Implement `/practice-center/speaking/page.tsx`.
- Build chat layout with AI readiness/status, topic chip, message bubbles, typing/listening state, text input, microphone button, lesson-goal checklist, and vocabulary suggestion panel.
- Add link button to `/practice-center/speaking/history`.

6. Speaking history and transcript
- Implement conversation history list with search input, grouped dates, status chips, edit/download/detail actions, and pagination UI.
- Implement transcript detail with conversation bubbles, inline grammar suggestion card, accuracy badge, detailed analysis panel, and Review Center CTA.

7. Data integration boundary
- Keep all initial page data in `_data`.
- Add simple async loader functions such as `getSkillModules(skill)`, `getPracticeLesson(skill, moduleId)`, `getConversationHistory()`.
- These loaders return mock data now and become the swap point for Gateway API calls later.

8. Verification
- Run `npm run lint --workspace @ai-agentic-english/web`.
- Run `npm run build --workspace @ai-agentic-english/web`.
- Manually verify desktop and mobile layouts for:
  - Practice Center hub
  - Reading module list
  - Exercise page
  - Speaking page
  - Speaking history
  - Transcript detail

## Test Cases And Scenarios

- Sidebar highlights Practice Center on all nested Practice Center routes.
- Back/breadcrumb navigation works from module list, exercise page, speaking history, and transcript page.
- Module cards render completed, in-progress, and locked states correctly.
- Exercise page preserves selected MCQ option state and disables/marks unavailable actions cleanly.
- Writing exercise variant renders a text input/textarea instead of MCQ.
- Speaking chat renders user and AI bubbles without overlap at desktop and mobile widths.
- Conversation history search filters mock rows.
- Transcript page renders feedback highlights, analysis scores, and Review Center CTA.
- Empty-state data can be displayed for no modules, no conversations, or no feedback.

## Assumptions

- Practice Center v1 is UI-first with typed mock data because backend feature endpoints are not implemented yet.
- Material Symbols remain the icon system for now.
- No new charting, audio, speech-recognition, or AI client dependencies are required for this UI milestone.
- Review Center and onboarding pages are planned later; Practice Center can show links/CTAs to them without implementing those pages in this milestone.


# Remaining UI Implementation Plan

## Summary
Implement the remaining UI in three blocks: Review Center, Onboarding, and supporting pages. Use typed mock data first, matching the current Practice Center approach, because backend feature endpoints are still mostly health-check skeletons. Keep Review Center and progress pages inside the existing dashboard shell, and keep onboarding outside the sidebar shell.

Also include a foundation pass to fix current mojibake text in shared UI and make breadcrumbs aware of Review Center, onboarding redirects, and progress pages.

## File Architecture

```txt
apps/web/app/
  page.tsx                         # Landing page
  auth/
    layout.tsx
    sign-in/[[...sign-in]]/page.tsx
    sign-up/[[...sign-up]]/page.tsx

  onboarding/
    layout.tsx
    username/page.tsx
    goals/page.tsx
    level/page.tsx
    assessment/page.tsx
    self-assessment/page.tsx
    preferences/page.tsx
    plan/page.tsx
    _components/
      OnboardingShell.tsx
      OnboardingProgress.tsx
      ChoiceCard.tsx
      SkillSelector.tsx
      LevelScale.tsx
      AssessmentQuestion.tsx
      TimeCommitmentSlider.tsx
      GeneratedPlanPreview.tsx
    _data/onboarding-content.ts
    _types/onboarding.ts
    _utils/onboarding-routes.ts

  main/
    progress/page.tsx

    review-center/
      page.tsx
      flashcards/page.tsx
      flashcards/[topicId]/page.tsx
      flashcards/[topicId]/study/page.tsx
      grammar/page.tsx
      grammar/[categoryId]/page.tsx
      grammar/[categoryId]/[lessonId]/page.tsx
      _components/
        ReviewHero.tsx
        ReviewFeatureCard.tsx
        FlashcardTopicGrid.tsx
        FlashcardTopicCard.tsx
        FlashcardGrid.tsx
        FlashcardStudy.tsx
        FlashcardOptionsMenu.tsx
        GrammarSection.tsx
        GrammarTopicCard.tsx
        GrammarLessonView.tsx
        ProgressSummaryCard.tsx
      _data/review-content.ts
      _types/review.ts
      _utils/review-routes.ts
```

## Step-By-Step Implementation

1. Shared foundation
- Fix Vietnamese mojibake in `DashboardTopBar`, `SideMenu`, and current mock data files.
- Extend `DashboardTopBar` breadcrumbs for `/main/review-center`, `/main/progress`, flashcards, grammar, and grammar lesson detail routes.
- Keep Material Symbols as the icon system and reuse current `ProgressBar` behavior, ideally moving it to a shared component later if duplication grows.

2. Review Center hub
- Implement `/main/review-center` matching `Trung tâm ôn luyện.png`.
- Show two main cards: Flashcard review and Grammar review.
- Route Flashcard card to `/main/review-center/flashcards`.
- Route Grammar card to `/main/review-center/grammar`.

3. Flashcard flow
- Implement topic grid matching `Flashcard.png`.
- Implement topic detail matching `Topic.png` with filters: all, unlearned, learned; sort label; add-card and start-study actions.
- Implement study page matching `Thẻ.png` with card count, front/back flip state, previous/next buttons, pronunciation button, fullscreen/menu icons, and options menu matching `Option Menu Component Container.png`.
- Use typed mock data with topic progress, card status, IPA, part of speech, definition, examples, and learned state.

4. Grammar review flow
- Implement grammar overview matching `Ngữ pháp.png`, grouped into sections such as “Các thì cơ bản”, “Cấu trúc câu phức”, and “Từ loại”.
- Implement category page matching `Dạng ngữ pháp.png` with difficulty filter, lesson cards, progress, and CTA states.
- Implement grammar lesson page matching `Bài học ngữ pháp.png` with theory cards, examples, multiple-choice practice, and answer-check button.
- Use typed mock data for grammar categories, lessons, theory blocks, signal words, examples, and practice questions.

5. Onboarding flow
- Implement separate `/onboarding/layout.tsx` without sidebar.
- Add username setup as the first post-signup step.
- Implement goal selection, level method selection, assessment test, self-assessment scale, personalization preferences, and generated plan preview.
- Match supplied onboarding designs:
  - goals page: selectable goal cards
  - level page: test vs self-assessment
  - assessment page: 4-skill short quiz UI
  - self-assessment page: 0-10 level scale
  - preferences page: daily time slider and skill priorities
  - plan page: generated roadmap explanation and final goal CTA
- Store state client-side for v1; later replace with onboarding API calls.

6. Progress and supporting pages
- Implement `/main/progress` matching `Tiến độ học tập chi tiết.png`.
- Add progress link from homepage progress card.
- Replace root `/` placeholder with a real landing page that routes to Clerk sign-in/sign-up.
- Keep Clerk auth pages as-is structurally, but style their layout container to match the product shell.
- Add simple `/main/help`, `/main/about`, and `/main/settings` pages only if navigation links should become real destinations in this UI pass.

## Types And Data Contracts

Add `review.ts`:
```ts
type ReviewArea = 'flashcards' | 'grammar'
type FlashcardStatus = 'learned' | 'unlearned'
type GrammarDifficulty = 'beginner' | 'intermediate' | 'advanced'
type GrammarProgressState = 'notStarted' | 'inProgress' | 'completed'

interface FlashcardTopic {
  id: string
  title: string
  description: string
  icon: string
  totalCards: number
  learnedCards: number
}

interface Flashcard {
  id: string
  topicId: string
  term: string
  ipa: string
  partOfSpeech: string
  definition: string
  example: string
  status: FlashcardStatus
}

interface GrammarLesson {
  id: string
  categoryId: string
  title: string
  description: string
  difficulty: GrammarDifficulty
  completedExercises: number
  totalExercises: number
  state: GrammarProgressState
}
```

Add `onboarding.ts`:
```ts
type LearningGoalId = 'conversation' | 'ielts' | 'business' | 'travel' | 'personal'
type AssessmentMethod = 'test' | 'selfAssessment'
type SkillId = 'listening' | 'speaking' | 'reading' | 'writing'

interface OnboardingProfile {
  username: string
  goalId: LearningGoalId
  assessmentMethod: AssessmentMethod
  levelScore: number
  dailyMinutes: number
  prioritySkills: SkillId[]
}
```

## Test Plan

- Run `npm run lint --workspace @ai-agentic-english/web`.
- Run `npm run build --workspace @ai-agentic-english/web`.
- Verify routes return 200:
  - `/`
  - `/onboarding/goals`
  - `/onboarding/assessment`
  - `/onboarding/preferences`
  - `/onboarding/plan`
  - `/main/review-center`
  - `/main/review-center/flashcards`
  - `/main/review-center/flashcards/technology`
  - `/main/review-center/flashcards/technology/study`
  - `/main/review-center/grammar`
  - `/main/review-center/grammar/basic-tenses`
  - `/main/review-center/grammar/basic-tenses/present-simple`
  - `/main/progress`
- Check responsive layouts for desktop and mobile widths.
- Confirm sidebar highlights Review Center for all nested Review Center routes.
- Confirm breadcrumbs/back path behavior works for nested Review Center and progress routes.
- Confirm onboarding CTAs move to the next intended step.

## Assumptions

- This is still UI-first with mock data and typed loaders.
- No new frontend dependency is required.
- Review Center and progress pages use the dashboard shell with sidebar.
- Onboarding uses its own centered shell and does not show sidebar.
- API integration, persistence, audio playback, real AI grading, and notification scheduling are later milestones.
