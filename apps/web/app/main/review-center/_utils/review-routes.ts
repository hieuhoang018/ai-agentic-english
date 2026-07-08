export const reviewCenterPath = '/main/review-center'

export function duePath() {
  return `${reviewCenterPath}/due`
}

export function flashcardsPath() {
  return `${reviewCenterPath}/flashcards`
}

export function flashcardTopicPath(topicId: string) {
  return `${flashcardsPath()}/${topicId}`
}

export function flashcardStudyPath(topicId: string) {
  return `${flashcardTopicPath(topicId)}/study`
}

export function grammarPath() {
  return `${reviewCenterPath}/grammar`
}

export function grammarCategoryPath(categoryId: string) {
  return `${grammarPath()}/${categoryId}`
}

export function grammarLessonPath(categoryId: string, lessonId: string) {
  return `${grammarCategoryPath(categoryId)}/${lessonId}`
}
