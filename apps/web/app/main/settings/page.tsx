'use client';

import { useEffect, useState } from 'react';

import type { UpdateUserSettingsDto, UserDto } from '@/lib/api/types';

type LoadState =
  | { status: 'loading' }
  | { status: 'success'; user: UserDto }
  | { status: 'error'; message: string };

type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'success' }
  | { status: 'error'; message: string };

const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'English' },
];

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message =
      typeof body?.message === 'string'
        ? body.message
        : `Request to ${url} failed with ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

export default function SettingsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });

  const [dailyTimeBudgetMinutes, setDailyTimeBudgetMinutes] = useState(20);
  const [lastSyncedDailyTimeBudgetMinutes, setLastSyncedDailyTimeBudgetMinutes] = useState(20);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState('08:00');
  const [preferredLanguage, setPreferredLanguage] = useState('vi');
  const [timezone, setTimezone] = useState('UTC');

  useEffect(() => {
    fetchJson<UserDto>('/api/users/me')
      .then((user) => {
        setState({ status: 'success', user });
        setDailyTimeBudgetMinutes(user.settings.dailyTimeBudgetMinutes);
        setLastSyncedDailyTimeBudgetMinutes(user.settings.dailyTimeBudgetMinutes);
        setReminderEnabled(user.settings.reminderTime !== null);
        setReminderTime(user.settings.reminderTime ?? '08:00');
        setPreferredLanguage(user.settings.preferredLanguage);
        setTimezone(user.settings.timezone);
      })
      .catch((error: unknown) => {
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Không thể tải cài đặt.',
        });
      });
  }, []);

  function useBrowserTimezone() {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }

  async function handleSave() {
    setSaveState({ status: 'saving' });

    const update: UpdateUserSettingsDto = {
      dailyTimeBudgetMinutes,
      preferredLanguage,
      timezone,
      reminderTime: reminderEnabled ? reminderTime : null,
    };

    try {
      await fetchJson('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      setSaveState({ status: 'success' });

      if (dailyTimeBudgetMinutes !== lastSyncedDailyTimeBudgetMinutes) {
        setLastSyncedDailyTimeBudgetMinutes(dailyTimeBudgetMinutes);
        // Best-effort: keep the daily plan in sync with the new time budget.
        // Must never block or fail the settings save itself.
        fetch('/api/plan/replan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ daily_minutes: dailyTimeBudgetMinutes, goals: [] }),
        }).catch((error: unknown) => {
          console.error('Failed to regenerate learning plan after settings save:', error);
        });
      }
    } catch (error) {
      setSaveState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Không thể lưu cài đặt.',
      });
    }
  }

  return (
    <div className="space-y-stack-lg">
      <div>
        <h1 className="text-3xl font-bold text-on-surface dark:text-on-primary">Cài đặt</h1>
        <p className="mt-2 text-base text-on-surface-variant dark:text-surface-dim">
          Quản lý thông báo, thời gian học mỗi ngày và tùy chọn tài khoản.
        </p>
      </div>

      {state.status === 'loading' && (
        <p className="text-sm text-on-surface-variant dark:text-surface-dim">Đang tải cài đặt...</p>
      )}

      {state.status === 'error' && <p className="text-sm text-error">{state.message}</p>}

      {state.status === 'success' && (
        <div className="flex flex-col gap-gutter">
          <section className="bg-surface-container-lowest dark:bg-surface-container-high rounded-lg p-card-padding shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-outline-variant/20 dark:border-outline/20">
            <h2 className="mb-6 flex items-center gap-2 text-lg font-semibold text-on-surface dark:text-on-primary">
              <span className="material-symbols-outlined text-primary">schedule</span>
              Thời gian học mỗi ngày
            </h2>
            <div className="mb-4 text-center font-bold text-primary">
              {dailyTimeBudgetMinutes} phút
            </div>
            <input
              className="w-full accent-primary"
              type="range"
              min={5}
              max={180}
              step={5}
              value={dailyTimeBudgetMinutes}
              onChange={(event) => setDailyTimeBudgetMinutes(Number(event.target.value))}
            />
            <div className="mt-2 flex justify-between text-sm text-on-surface-variant dark:text-surface-dim">
              <span>5 phút</span>
              <span>3+ giờ</span>
            </div>
          </section>

          <section className="bg-surface-container-lowest dark:bg-surface-container-high rounded-lg p-card-padding shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-outline-variant/20 dark:border-outline/20">
            <h2 className="mb-6 flex items-center gap-2 text-lg font-semibold text-on-surface dark:text-on-primary">
              <span className="material-symbols-outlined text-primary">notifications</span>
              Nhắc nhở hằng ngày
            </h2>
            <label className="flex items-center gap-3 text-sm text-on-surface dark:text-on-primary">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={reminderEnabled}
                onChange={(event) => setReminderEnabled(event.target.checked)}
              />
              Nhận nhắc nhở học mỗi ngày
            </label>
            {reminderEnabled && (
              <div className="mt-4 flex items-center gap-3">
                <input
                  type="time"
                  className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface dark:bg-surface-variant dark:text-on-primary dark:border-outline"
                  value={reminderTime}
                  onChange={(event) => setReminderTime(event.target.value)}
                />
              </div>
            )}
          </section>

          <section className="bg-surface-container-lowest dark:bg-surface-container-high rounded-lg p-card-padding shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-outline-variant/20 dark:border-outline/20">
            <h2 className="mb-6 flex items-center gap-2 text-lg font-semibold text-on-surface dark:text-on-primary">
              <span className="material-symbols-outlined text-primary">translate</span>
              Ngôn ngữ &amp; múi giờ
            </h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-on-surface-variant dark:text-surface-dim">
                  Ngôn ngữ ưu tiên
                </label>
                <select
                  className="w-full rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface dark:bg-surface-variant dark:text-on-primary dark:border-outline"
                  value={preferredLanguage}
                  onChange={(event) => setPreferredLanguage(event.target.value)}
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm text-on-surface-variant dark:text-surface-dim">
                  Múi giờ
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="w-full rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface dark:bg-surface-variant dark:text-on-primary dark:border-outline"
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                  />
                  <button
                    type="button"
                    onClick={useBrowserTimezone}
                    className="shrink-0 rounded-lg border border-outline-variant px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container dark:border-outline dark:text-surface-dim dark:hover:bg-surface-variant"
                  >
                    Dùng múi giờ hiện tại
                  </button>
                </div>
              </div>
            </div>
          </section>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={saveState.status === 'saving'}
              className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saveState.status === 'saving' ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
            {saveState.status === 'success' && (
              <span className="text-sm text-secondary">Đã lưu thành công.</span>
            )}
            {saveState.status === 'error' && (
              <span className="text-sm text-error">{saveState.message}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
