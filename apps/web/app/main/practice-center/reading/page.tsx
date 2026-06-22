import { notFound } from 'next/navigation'
import ModuleList from '../_components/ModuleList'
import { getSkillConfig, getSkillModules } from '../_data/practice-content'

export default async function ReadingPage() {
  const skill = await getSkillConfig('reading')
  if (!skill) notFound()
  const modules = await getSkillModules('reading')

  return <ModuleList skill={skill} modules={modules} />
}
