import { notFound } from 'next/navigation'
import ExerciseWorkspace from '../../../_components/ExerciseWorkspace'
import { getAllModuleParams, getPracticeLesson, isPracticeSkillId } from '../../../_data/practice-content'

type ModuleExercisePageProps = {
  params: Promise<{
    skill: string
    moduleId: string
  }>
}

export function generateStaticParams() {
  return getAllModuleParams()
}

export default async function ModuleExercisePage({ params }: ModuleExercisePageProps) {
  const { skill, moduleId } = await params
  if (!isPracticeSkillId(skill)) {
    notFound()
  }

  const lesson = await getPracticeLesson(skill, moduleId)
  if (!lesson) {
    notFound()
  }

  return <ExerciseWorkspace lesson={lesson} />
}
