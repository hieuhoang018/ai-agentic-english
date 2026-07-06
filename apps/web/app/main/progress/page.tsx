'use client';

import { useEffect, useState } from 'react';

import ProgressSummaryCard from '../review-center/_components/ProgressSummaryCard';
import { goals as onboardingGoals } from '../../onboarding/_data/onboarding-content';
import type {
  AnalysisLatestResponse,
  ExerciseLibraryResponse,
  ProfileSummaryResponse,
  SessionSummaryItem,
} from '@/lib/api/types';

// goal_profile.goals[0] stores the raw onboarding goal id (e.g. "conversation")
// — look up the same Vietnamese title shown on the onboarding goals page
// rather than displaying the id itself.
function goalTitle(goalId: string | undefined): string {
  const match = onboardingGoals.find((goal) => goal.id === goalId);
  return match?.title ?? 'Mục tiêu học tập của bạn';
}

type LoadState<T> = { status: 'loading' } | { status: 'success'; data: T } | { status: 'error' };

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request to ${url} failed with ${response.status}`);
  return response.json() as Promise<T>;
}

// Mirrors agents/shared/cefr.py's theta_to_cefr — keep thresholds in sync.
function thetaToCefr(theta: number | null): string {
  if (theta === null) return 'Chưa đánh giá';
  if (theta < -1.5) return 'A1';
  if (theta < -0.5) return 'A2';
  if (theta < 0.5) return 'B1';
  if (theta < 1.5) return 'B2';
  if (theta < 2.5) return 'C1';
  return 'C2';
}

// Same -1.5..2.5 CEFR band span as thetaToCefr, extended slightly at both
// ends and clamped, purely for the bar's visual fill — not a real score.
function thetaToPercent(theta: number | null): number {
  if (theta === null) return 0;
  const clamped = Math.min(Math.max(theta, -2), 3);
  return Math.round(((clamped + 2) / 5) * 100);
}

const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function weeklyMinutesByDay(sessions: SessionSummaryItem[]): number[] {
  const totals = [0, 0, 0, 0, 0, 0, 0]; // Mon..Sun
  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - mondayOffset);

  for (const session of sessions) {
    if (!session.end_time) continue;
    const start = new Date(session.start_time);
    const end = new Date(session.end_time);
    const minutes = (end.getTime() - start.getTime()) / 60000;
    if (!(minutes > 0) || start < monday) continue;
    const dayIndex = (start.getDay() + 6) % 7;
    totals[dayIndex] += minutes;
  }
  return totals;
}

const SKILL_DOMAIN_LABELS: Record<string, string> = {
  LISTENING: 'Nghe',
  SPEAKING: 'Nói',
  READING: 'Đọc',
  WRITING: 'Viết',
};

export default function ProgressPage() {
  const [profile, setProfile] = useState<LoadState<ProfileSummaryResponse>>({ status: 'loading' });
  const [sessions, setSessions] = useState<LoadState<SessionSummaryItem[]>>({ status: 'loading' });
  const [library, setLibrary] = useState<LoadState<ExerciseLibraryResponse>>({ status: 'loading' });
  const [analysis, setAnalysis] = useState<LoadState<AnalysisLatestResponse>>({ status: 'loading' });

  useEffect(() => {
    fetchJson<ProfileSummaryResponse>('/api/profile')
      .then((data) => setProfile({ status: 'success', data }))
      .catch(() => setProfile({ status: 'error' }));

    fetchJson<SessionSummaryItem[]>('/api/sessions')
      .then((data) => setSessions({ status: 'success', data }))
      .catch(() => setSessions({ status: 'error' }));

    fetchJson<ExerciseLibraryResponse>('/api/habit/library')
      .then((data) => setLibrary({ status: 'success', data }))
      .catch(() => setLibrary({ status: 'error' }));

    fetchJson<AnalysisLatestResponse>('/api/analysis')
      .then((data) => setAnalysis({ status: 'success', data }))
      .catch(() => setAnalysis({ status: 'error' }));
  }, []);

  const goalText = goalTitle(
    profile.status === 'success' ? profile.data.goal_profile?.goals?.[0] : undefined,
  );

  const activities = library.status === 'success' ? library.data.todaysPlan[0]?.activities ?? [] : [];
  const completedCount = activities.filter((activity) => activity.completed).length;
  const totalCount = activities.length;
  const todayPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const theta = profile.status === 'success' ? profile.data.irt_theta : null;

  const weekly = sessions.status === 'success' ? weeklyMinutesByDay(sessions.data) : [0, 0, 0, 0, 0, 0, 0];
  const maxWeekly = Math.max(...weekly, 1);
  const totalWeeklyHours = (weekly.reduce((sum, minutes) => sum + minutes, 0) / 60).toFixed(1);

  const patterns = analysis.status === 'success' ? analysis.data.patterns : [];
  const plateauSkills =
    analysis.status === 'success'
      ? Object.entries(analysis.data.plateau_by_skill).filter(([, result]) => result.plateau)
      : [];
  const behavioralRisk =
    analysis.status === 'success' &&
    analysis.data.risk_score !== null &&
    analysis.data.risk_score > 0.7;
  const hasInsights = patterns.length > 0 || plateauSkills.length > 0 || behavioralRisk;

  return (
    <div>
      <h1 className="mb-8 text-4xl font-bold text-on-surface">Tiến độ học tập chi tiết</h1>

      <section className="mb-8 rounded-lg border border-outline-variant bg-surface-container-lowest p-6 shadow-[0_10px_32px_-24px_rgba(15,23,42,0.55)]">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-lg text-on-surface">{goalText}</p>
            {profile.status === 'success' && profile.data.cold_start_flag && (
              <p className="mt-2 text-on-surface-variant">
                Chưa đủ dữ liệu để đánh giá chính xác — hãy hoàn thành thêm bài luyện tập.
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-6xl font-bold text-primary">{library.status === 'success' ? `${todayPercent}%` : '—'}</p>
            <p className="text-sm text-on-surface-variant">Tiến độ nhiệm vụ hôm nay</p>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-variant">
          <div
            className="h-full rounded-full bg-linear-to-r from-primary to-secondary"
            style={{ width: `${todayPercent}%` }}
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-outline-variant bg-surface-container-lowest p-6 shadow-[0_10px_32px_-24px_rgba(15,23,42,0.55)]">
          <h2 className="mb-6 flex items-center gap-3 border-b border-outline-variant pb-4 text-2xl font-bold">
            <span className="rounded-lg bg-violet-100 p-2 text-tertiary material-symbols-outlined">flag</span>
            Trình độ theo kỹ năng
          </h2>
          {profile.status === 'loading' && (
            <p className="text-sm text-on-surface-variant">Đang tải...</p>
          )}
          {profile.status === 'error' && (
            <p className="text-sm text-error">Không thể tải dữ liệu trình độ. Vui lòng thử lại sau.</p>
          )}
          {profile.status === 'success' && (
            <div className="space-y-4">
              <ProgressSummaryCard
                label="Nghe (Listening)"
                current={thetaToCefr(theta?.L ?? null)}
                value={thetaToPercent(theta?.L ?? null)}
                tone="bg-secondary"
              />
              <ProgressSummaryCard
                label="Đọc (Reading)"
                current={thetaToCefr(theta?.R ?? null)}
                value={thetaToPercent(theta?.R ?? null)}
                tone="bg-secondary"
              />
              <ProgressSummaryCard
                label="Viết (Writing)"
                current={thetaToCefr(theta?.W ?? null)}
                value={thetaToPercent(theta?.W ?? null)}
              />
              <ProgressSummaryCard
                label="Nói (Speaking)"
                current="Chưa đánh giá"
                value={0}
              />
            </div>
          )}
        </section>

        <section className="rounded-lg border border-outline-variant bg-surface-container-lowest p-6 shadow-[0_10px_32px_-24px_rgba(15,23,42,0.55)]">
          <h2 className="mb-6 flex items-center gap-3 border-b border-outline-variant pb-4 text-2xl font-bold">
            <span className="rounded-lg bg-emerald-100 p-2 text-secondary material-symbols-outlined">bar_chart</span>
            Biểu đồ hoạt động
          </h2>
          {sessions.status === 'loading' && (
            <p className="text-sm text-on-surface-variant">Đang tải...</p>
          )}
          {sessions.status === 'error' && (
            <p className="text-sm text-error">Không thể tải dữ liệu hoạt động. Vui lòng thử lại sau.</p>
          )}
          {sessions.status === 'success' && (
            <>
              <div className="flex h-64 items-end justify-between gap-4 border-b border-outline-variant px-4">
                {weekly.map((minutes, index) => (
                  <div key={WEEKDAY_LABELS[index]} className="flex flex-1 flex-col items-center justify-end gap-3">
                    <div
                      className="w-full max-w-8 rounded-t bg-primary"
                      style={{ height: `${Math.max((minutes / maxWeekly) * 100, minutes > 0 ? 4 : 0)}%` }}
                    />
                    <span className="text-sm text-on-surface-variant">{WEEKDAY_LABELS[index]}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex justify-between text-sm">
                <span>Tổng thời gian tuần này: {totalWeeklyHours} giờ</span>
              </div>
            </>
          )}
        </section>
      </div>

      {analysis.status === 'success' && hasInsights && (
        <section className="mt-6 rounded-lg border border-outline-variant bg-surface-container-lowest p-6 shadow-[0_10px_32px_-24px_rgba(15,23,42,0.55)]">
          <h2 className="mb-6 flex items-center gap-3 border-b border-outline-variant pb-4 text-2xl font-bold">
            <span className="rounded-lg bg-amber-100 p-2 text-secondary material-symbols-outlined">insights</span>
            Nhận định
          </h2>
          <div className="space-y-3">
            {plateauSkills.map(([skill]) => (
              <p key={skill} className="text-sm text-on-surface-variant">
                Bạn có dấu hiệu chững lại ở kỹ năng{' '}
                <span className="font-semibold text-on-surface">{SKILL_DOMAIN_LABELS[skill] ?? skill}</span> — hãy thử
                một dạng bài tập mới để cải thiện.
              </p>
            ))}
            {patterns.slice(0, 3).map((pattern, index) => (
              <p key={index} className="text-sm text-on-surface-variant">
                Lỗi lặp lại:{' '}
                <span className="font-semibold text-on-surface">{pattern.error_type}</span> (
                {SKILL_DOMAIN_LABELS[pattern.skill_domain] ?? pattern.skill_domain}) — xuất hiện trong{' '}
                {pattern.count} buổi học
              </p>
            ))}
            {behavioralRisk && (
              <p className="text-sm text-error">
                Có dấu hiệu giảm động lực học tập gần đây — hãy dành chút thời gian ôn tập hôm nay.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
