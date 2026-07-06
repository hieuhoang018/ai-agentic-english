'use client';

import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { ExerciseLibraryResponse, OnboardingActivity, StreakResponse } from '@/lib/api/types';

type LoadState<T> = { status: 'loading' } | { status: 'success'; data: T } | { status: 'error' };

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request to ${url} failed with ${response.status}`);
  return response.json() as Promise<T>;
}

const SKILL_ROUTES: Record<string, string> = {
  L: '/main/practice-center/listening',
  S: '/main/practice-center/speaking',
  R: '/main/practice-center/reading',
  W: '/main/practice-center/writing',
};

const SKILL_LABELS: Record<string, string> = {
  L: 'Nghe',
  S: 'Nói',
  R: 'Đọc',
  W: 'Viết',
};

function activityHref(activity: OnboardingActivity): string {
  return SKILL_ROUTES[activity.skill_domain] ?? '/main/practice-center';
}

function activityDetail(activity: OnboardingActivity): string {
  const skillLabel = SKILL_LABELS[activity.skill_domain] ?? activity.skill_domain;
  return `${activity.estimated_minutes} phút · ${skillLabel}`;
}

export default function HomePage() {
  const { user } = useUser();
  const [library, setLibrary] = useState<LoadState<ExerciseLibraryResponse>>({ status: 'loading' });
  const [streak, setStreak] = useState<LoadState<StreakResponse>>({ status: 'loading' });

  console.log(library);

  useEffect(() => {
    fetchJson<ExerciseLibraryResponse>('/api/habit/library')
      .then((data) => setLibrary({ status: 'success', data }))
      .catch(() => setLibrary({ status: 'error' }));

    fetchJson<StreakResponse>('/api/habit/streak')
      .then((data) => setStreak({ status: 'success', data }))
      .catch(() => setStreak({ status: 'error' }));
  }, []);

  const activities: OnboardingActivity[] =
    library.status === 'success' ? (library.data.todaysPlan[0]?.activities ?? []) : [];
  const dueCount = library.status === 'success' ? library.data.dueForReview.length : null;
  const completedCount = activities.filter((activity) => activity.completed).length;
  const totalCount = activities.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const streakCount = streak.status === 'success' ? streak.data.streak : null;

  return (
    <div className="space-y-stack-lg">
      <div>
        <h2 className="text-3xl font-bold text-on-surface dark:text-on-primary">
          Chào buổi sáng{user?.firstName ? `, ${user.firstName}` : ''}!
        </h2>
        <p className="text-base text-on-surface-variant dark:text-surface-dim mt-2">
          Sẵn sàng để tiếp tục hành trình chinh phục tiếng Anh của bạn chưa?
        </p>
      </div>

      <div className="flex flex-col gap-stack-lg w-full">
        <section className="w-full">
          <Link
            href="/main/progress"
            className="bg-surface-container-lowest dark:bg-surface-container-high rounded-lg p-card-padding shadow-[0_4px_20px_-4px_rgba(15,98,254,0.08)] border border-outline-variant/20 dark:border-outline/20 flex flex-col justify-between hover:shadow-[0_8px_30px_-4px_rgba(15,98,254,0.12)] transition-shadow duration-300 w-full"
          >
            <div className="flex justify-between items-start mb-6 gap-4">
              <div>
                <h3 className="text-2xl font-semibold text-on-surface dark:text-on-primary">
                  Tiến độ hôm nay
                </h3>
                <p className="text-base text-on-surface-variant dark:text-surface-dim mt-1">
                  Mục tiêu: Đạt IELTS 7.0
                </p>
              </div>
              <div className="bg-primary-container/10 px-3 py-1.5 rounded-full flex items-center gap-1.5 text-primary shrink-0">
                <span className="material-symbols-outlined text-sm filled text-error">
                  local_fire_department
                </span>
                <span className="text-sm font-bold">{streakCount ?? '…'} ngày streak</span>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-on-surface-variant dark:text-surface-dim">
                  Nhiệm vụ hôm nay
                </span>
                <span className="text-primary font-bold">{progressPercent}%</span>
              </div>
              <div className="w-full h-3 bg-surface-container dark:bg-surface-variant rounded-full overflow-hidden">
                <div
                  className="h-full bg-linear-to-r from-primary to-secondary-container rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </Link>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-gutter w-full">
          <div className="flex flex-col gap-gutter h-full">
            <Link
              href="/main/review-center/flashcards"
              className="bg-surface-container-lowest dark:bg-surface-container-high rounded-lg p-card-padding shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-outline-variant/20 dark:border-outline/20 hover:-translate-y-1 transition-transform cursor-pointer"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-secondary-container/30 flex items-center justify-center text-on-secondary-container dark:text-secondary-fixed">
                  <span className="material-symbols-outlined text-sm">psychology</span>
                </div>
                <h4 className="text-base font-bold text-on-surface dark:text-on-primary">
                  Ôn tập từ vựng nhanh
                </h4>
              </div>
              <p className="text-sm text-on-surface-variant dark:text-surface-dim mb-4">
                Bạn có {dueCount ?? '…'} từ cần ôn lại hôm nay theo phương pháp lặp lại ngắt quãng.
              </p>
              <div className="w-full py-2 bg-surface-container-high dark:bg-surface-variant hover:bg-surface-variant dark:hover:bg-surface-container text-on-surface dark:text-on-primary rounded-lg text-sm font-medium transition-colors border border-outline-variant/50 dark:border-outline/50 text-center">
                Ôn tập ngay
              </div>
            </Link>
            <Link
              href="/main/practice-center/speaking"
              className="bg-linear-to-br from-tertiary-fixed to-primary-fixed dark:from-tertiary dark:to-primary rounded-lg p-card-padding shadow-[0_4px_20px_-4px_rgba(106,0,242,0.15)] flex flex-col justify-between relative overflow-hidden group cursor-pointer flex-1"
            >
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/20 rounded-full blur-2xl" />
              <div className="relative z-10">
                <div className="bg-white/50 dark:bg-black/20 w-10 h-10 rounded-full flex items-center justify-center mb-4 backdrop-blur-sm">
                  <span className="material-symbols-outlined text-tertiary dark:text-tertiary-fixed">
                    smart_toy
                  </span>
                </div>
                <h3 className="text-2xl font-semibold text-on-tertiary-fixed dark:text-on-primary">
                  Trò chuyện với AI Tutor
                </h3>
                <p className="text-base text-on-tertiary-fixed/80 dark:text-on-primary/80 mt-2 line-clamp-2">
                  Thực hành giao tiếp tự nhiên và nhận phản hồi tức thì.
                </p>
              </div>
              <div className="relative z-10 mt-6 flex items-center text-tertiary dark:text-tertiary-fixed font-bold group-hover:translate-x-1 transition-transform">
                <span className="text-base mr-1">Bắt đầu ngay</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </div>
            </Link>
          </div>
          <div className="bg-surface-container-lowest dark:bg-surface-container-high rounded-lg p-card-padding shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-outline-variant/20 dark:border-outline/20 h-full">
            <div className="flex justify-between items-center mb-6 gap-4">
              <h3 className="text-2xl font-semibold text-on-surface dark:text-on-primary">
                Nhiệm vụ hằng ngày
              </h3>
              <span className="text-sm bg-surface-container dark:bg-surface-variant px-2 py-1 rounded-md text-on-surface-variant dark:text-surface-dim shrink-0">
                {totalCount > 0 ? `${completedCount}/${totalCount} hoàn thành` : '—'}
              </span>
            </div>
            <div className="space-y-3">
              {library.status === 'loading' && (
                <p className="text-sm text-on-surface-variant dark:text-surface-dim">
                  Đang tải nhiệm vụ hôm nay...
                </p>
              )}
              {library.status === 'error' && (
                <p className="text-sm text-error">
                  Không thể tải nhiệm vụ hôm nay. Vui lòng thử lại sau.
                </p>
              )}
              {library.status === 'success' && totalCount === 0 && (
                <p className="text-sm text-on-surface-variant dark:text-surface-dim">
                  Chưa có nhiệm vụ nào cho hôm nay. Hãy bắt đầu{' '}
                  <Link href="/main/practice-center" className="text-primary font-medium">
                    luyện tập
                  </Link>{' '}
                  để nhận lộ trình cá nhân hóa.
                </p>
              )}
              {activities
                .filter((activity) => activity.completed)
                .map((activity) => (
                  <div
                    key={activity.activity_id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-surface-container-low/50 dark:bg-surface-variant/50 opacity-70"
                  >
                    <span className="material-symbols-outlined text-secondary mt-0.5">
                      check_circle
                    </span>
                    <div>
                      <h4 className="text-base line-through text-on-surface-variant dark:text-surface-dim">
                        {activity.title}
                      </h4>
                      <p className="text-sm text-on-surface-variant/80 dark:text-surface-dim/80 mt-1">
                        {activityDetail(activity)}
                      </p>
                    </div>
                  </div>
                ))}
              {activities
                .filter((activity) => !activity.completed)
                .map((activity) => (
                  <Link
                    key={activity.activity_id}
                    href={activityHref(activity)}
                    className="flex items-start gap-3 p-3 rounded-lg bg-surface-container dark:bg-surface-variant border-l-2 border-primary cursor-pointer hover:bg-surface-container-high dark:hover:bg-surface-container transition-colors group"
                  >
                    <span className="material-symbols-outlined text-outline mt-0.5">
                      radio_button_unchecked
                    </span>
                    <div className="flex-1">
                      <h4 className="text-base text-on-surface dark:text-on-primary group-hover:text-primary transition-colors">
                        {activity.title}
                      </h4>
                      <p className="text-sm text-on-surface-variant dark:text-surface-dim mt-1">
                        {activityDetail(activity)}
                      </p>
                    </div>
                    <span className="text-primary hover:bg-primary-container/20 p-1.5 rounded-full transition-colors">
                      <span className="material-symbols-outlined text-sm">play_arrow</span>
                    </span>
                  </Link>
                ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
