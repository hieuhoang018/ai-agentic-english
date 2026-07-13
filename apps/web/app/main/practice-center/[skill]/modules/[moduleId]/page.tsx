import { notFound } from 'next/navigation';

import { isApiError } from '@/lib/api/client';
import { serverApiFetch } from '@/lib/api/server';
import type { ExerciseDto, LessonDto, ModuleDto } from '@/lib/api/types';

import ExerciseWorkspace from '../../../_components/ExerciseWorkspace';
import { getActivePathModuleIds, isModuleInActivePath } from '../../../_lib/active-path';
import { isPracticeSkillId } from '../../../_lib/practice-catalog';

type ModuleExercisePageProps = {
  params: Promise<{
    skill: string;
    moduleId: string;
  }>;
  searchParams: Promise<{
    lesson?: string;
    exercise?: string;
  }>;
};

export const dynamic = 'force-dynamic';

async function getRequired<TResponse>(path: string): Promise<TResponse> {
  try {
    return await serverApiFetch<TResponse>(path);
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }
}

export default async function ModuleExercisePage({
  params,
  searchParams,
}: ModuleExercisePageProps) {
  const { skill, moduleId } = await params;
  if (!isPracticeSkillId(skill)) notFound();
  const activePathModuleIds = await getActivePathModuleIds();
  if (!isModuleInActivePath(moduleId, activePathModuleIds)) notFound();

  const practiceModule = await getRequired<ModuleDto>(`/modules/${moduleId}`);
  if (practiceModule.skillFocus !== skill) notFound();

  const lessons = await getRequired<LessonDto[]>(`/modules/${moduleId}/lessons`);
  const requestedSelection = await searchParams;
  const lessonId = lessons.some((lesson) => lesson.id === requestedSelection.lesson)
    ? requestedSelection.lesson!
    : lessons[0]?.id;

  if (!lessonId) {
    return (
      <section className="rounded-lg border border-dashed border-outline-variant bg-surface-container-lowest p-8 text-center text-on-surface-variant dark:border-outline dark:bg-surface-dark dark:text-surface-dim">
        This module does not have any lessons yet.
      </section>
    );
  }

  const lesson = await getRequired<LessonDto>(`/lessons/${lessonId}`);
  if (lesson.moduleId !== practiceModule.id) notFound();

  const exercises = await getRequired<ExerciseDto[]>(`/lessons/${lesson.id}/exercises`);
  const exerciseId = exercises.some((exercise) => exercise.id === requestedSelection.exercise)
    ? requestedSelection.exercise!
    : exercises[0]?.id;

  if (!exerciseId) {
    return (
      <section className="rounded-lg border border-dashed border-outline-variant bg-surface-container-lowest p-8 text-center text-on-surface-variant dark:border-outline dark:bg-surface-dark dark:text-surface-dim">
        This lesson does not have any exercises yet.
      </section>
    );
  }

  const exercise = await getRequired<ExerciseDto>(`/exercises/${exerciseId}`);
  if (exercise.lessonId !== lesson.id) notFound();

  return (
    <ExerciseWorkspace
      skill={skill}
      module={practiceModule}
      lessons={lessons}
      lesson={lesson}
      exercises={exercises}
      exercise={exercise}
    />
  );
}
