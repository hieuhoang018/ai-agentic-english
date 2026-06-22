import ConversationHistoryList from '../../_components/ConversationHistoryList'
import { getConversationHistory } from '../../_data/speaking-content'

export default async function SpeakingHistoryPage() {
  const conversations = await getConversationHistory()

  return <ConversationHistoryList conversations={conversations} />
}
