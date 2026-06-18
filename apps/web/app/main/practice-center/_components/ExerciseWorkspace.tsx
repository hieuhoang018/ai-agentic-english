import type { PracticeLesson } from '../_types/practice'
import ExerciseNavigation from './ExerciseNavigation'
import ProgressBar from './ProgressBar'
import QuestionPanel from './QuestionPanel'
import TheoryPanel from './TheoryPanel'

type ExerciseWorkspaceProps = {
  lesson: PracticeLesson
}

export default function ExerciseWorkspace({ lesson }: ExerciseWorkspaceProps) {
  return (
    <div>
      <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-4xl font-bold text-on-surface">{lesson.moduleTitle}</h1>
          <p className="mt-2 text-lg text-on-surface-variant">{lesson.moduleSubtitle}</p>
        </div>
        <div className="flex w-full items-center gap-3 md:w-64">
          <span className="text-sm font-semibold text-[#007a4d]">Tiến độ:</span>
          <ProgressBar value={lesson.progressPercent} tone="success" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[310px_minmax(0,1fr)]">
        <TheoryPanel theory={lesson.theory} tip={lesson.tip} />
        <QuestionPanel question={lesson.question} feedback={lesson.feedback} />
      </div>

      <ExerciseNavigation initialQuestion={lesson.questionNumber} totalQuestions={lesson.totalQuestions} />
    </div>
  )
}
