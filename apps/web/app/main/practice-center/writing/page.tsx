import { notFound } from 'next/navigation'
import ModuleList from '../_components/ModuleList'
import { getSkillConfig, getSkillModules } from '../_data/practice-content'

export default async function WritingPage() {
  const skill = await getSkillConfig('writing')
  if (!skill) notFound()
  const modules = await getSkillModules('writing')

  return <ModuleList skill={skill} modules={modules} />
}
