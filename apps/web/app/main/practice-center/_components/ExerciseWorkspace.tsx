import Link from 'next/link';

import type { ExerciseDto, LessonDto, ModuleDto } from '@/lib/api/types';

import type { PracticeSkillId } from '../_types/practice';
import { toPracticeQuestion, toTheoryBlocks } from '../_lib/practice-catalog';
import { modulePath } from '../_utils/routes';
import ExerciseNavigation from './ExerciseNavigation';
import QuestionPanel from './QuestionPanel';
import TheoryPanel from './TheoryPanel';

type ExerciseWorkspaceProps = {
  skill: PracticeSkillId;
  module: ModuleDto;
  lessons: LessonDto[];
  lesson: LessonDto;
  exercises: ExerciseDto[];
  exercise: ExerciseDto;
};

export default function ExerciseWorkspace({
  skill,
  module,
  lessons,
  lesson,
  exercises,
  exercise,
}: ExerciseWorkspaceProps) {
  const question = toPracticeQuestion(exercise);
  const exerciseIndex = exercises.findIndex((item) => item.id === exercise.id);
  const previousExercise = exercises[exerciseIndex - 1];
  const nextExercise = exercises[exerciseIndex + 1];

  return (
    <div>
      <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-on-surface dark:text-on-primary sm:text-4xl">{module.title}</h1>
          <p className="mt-2 text-base text-on-surface-variant dark:text-surface-dim sm:text-lg">{lesson.title}</p>
        </div>
      </div>

      <section className="mb-6 rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-4 dark:border-outline/50 dark:bg-surface-dark">
        <h2 className="text-sm font-bold uppercase tracking-wide text-on-surface-variant dark:text-surface-dim">
          Lessons
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {lessons.map((item) => (
            <Link
              key={item.id}
              href={modulePath(skill, module.id, { lessonId: item.id })}
              className={`rounded-full px-3 py-2 text-sm font-semibold transition-colors ${item.id === lesson.id ? 'bg-primary text-white' : 'bg-surface-container text-on-surface hover:bg-surface-container-high dark:bg-surface-dark-high dark:text-on-primary dark:hover:bg-surface-dark-high'}`}
            >
              {item.order}. {item.title}
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[310px_minmax(0,1fr)]">
        <TheoryPanel
          theory={toTheoryBlocks(lesson)}
          tip="Read the lesson material carefully before submitting your answer."
        />
        <div>
          {exercises.length > 1 ? (
            <nav aria-label="Exercises" className="mb-4 flex flex-wrap gap-2">
              {exercises.map((item, index) => (
                <Link
                  key={item.id}
                  href={modulePath(skill, module.id, { lessonId: lesson.id, exerciseId: item.id })}
                  className={`flex h-9 min-w-9 items-center justify-center rounded-full px-3 text-sm font-semibold transition-colors ${item.id === exercise.id ? 'bg-primary text-white' : 'bg-surface-container text-on-surface hover:bg-surface-container-high dark:bg-surface-dark-high dark:text-on-primary dark:hover:bg-surface-dark-high'}`}
                >
                  {index + 1}
                </Link>
              ))}
            </nav>
          ) : null}
          <QuestionPanel key={exercise.id} question={question} />
        </div>
      </div>

      <ExerciseNavigation
        currentQuestion={exerciseIndex + 1}
        totalQuestions={exercises.length}
        previousHref={
          previousExercise
            ? modulePath(skill, module.id, { lessonId: lesson.id, exerciseId: previousExercise.id })
            : undefined
        }
        nextHref={
          nextExercise
            ? modulePath(skill, module.id, { lessonId: lesson.id, exerciseId: nextExercise.id })
            : undefined
        }
      />
    </div>
  );
}
