import { notFound } from 'next/navigation'
import ModuleList from '../_components/ModuleList'
import { getSkillConfig, getSkillModules } from '../_data/practice-content'

export default async function ListeningPage() {
  const skill = await getSkillConfig('listening')
  if (!skill) notFound()
  const modules = await getSkillModules('listening')

  return <ModuleList skill={skill} modules={modules} />
}
