const activeOnboardingKeyPrefix = 'english-academy:onboarding-active';
const completedOnboardingKeyPrefix = 'english-academy:onboarding-completed';

function getUserScopedKey(prefix: string, userId: string) {
  return `${prefix}:${userId}`;
}

export function markOnboardingActive(userId: string) {
  window.sessionStorage.setItem(getUserScopedKey(activeOnboardingKeyPrefix, userId), 'true');
}

export function clearOnboardingActive(userId: string) {
  window.sessionStorage.removeItem(getUserScopedKey(activeOnboardingKeyPrefix, userId));
}

export function markOnboardingComplete(userId: string) {
  clearOnboardingActive(userId);
  window.localStorage.setItem(getUserScopedKey(completedOnboardingKeyPrefix, userId), 'true');
}

export function clearStoredOnboardingComplete(userId: string) {
  window.localStorage.removeItem(getUserScopedKey(completedOnboardingKeyPrefix, userId));
}
