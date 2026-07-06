import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { apiFetch, isApiError } from '@/lib/api/client';
import type { CefrLevel, OnboardingRequest, OnboardingResponse, SkillEstimateKey, SkillEstimates } from '@/lib/api/types';

const cefrLevels = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const skillEstimateKeys = new Set<SkillEstimateKey>(['R', 'L', 'W']);

type OnboardingPlanRequest = Partial<Omit<OnboardingRequest, 'userId'>>;

function isCefrLevel(value: unknown): value is CefrLevel {
  return typeof value === 'string' && cefrLevels.has(value);
}

function readSkillEstimates(value: unknown): SkillEstimates | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const skillEstimates: SkillEstimates = {};
  for (const [key, estimate] of Object.entries(value)) {
    if (!skillEstimateKeys.has(key as SkillEstimateKey)) return null;
    if (typeof estimate !== 'number' || !Number.isFinite(estimate)) return null;

    skillEstimates[key as SkillEstimateKey] = estimate;
  }

  return Object.keys(skillEstimates).length > 0 ? skillEstimates : undefined;
}

export async function POST(request: Request) {
  const { getToken, userId } = await auth();

  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: OnboardingPlanRequest;
  try {
    body = (await request.json()) as OnboardingPlanRequest;
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  if (!isCefrLevel(body.currentLevel)) {
    return NextResponse.json({ message: 'currentLevel must be a valid CEFR level' }, { status: 400 });
  }

  if (
    typeof body.dailyTimeBudgetMinutes !== 'number' ||
    !Number.isFinite(body.dailyTimeBudgetMinutes) ||
    body.dailyTimeBudgetMinutes <= 0
  ) {
    return NextResponse.json({ message: 'dailyTimeBudgetMinutes must be a positive number' }, { status: 400 });
  }

  if (!Array.isArray(body.goals) || body.goals.some((goal) => typeof goal !== 'string')) {
    return NextResponse.json({ message: 'goals must be an array of strings' }, { status: 400 });
  }

  const skillEstimates = readSkillEstimates(body.skillEstimates);
  if (skillEstimates === null) {
    return NextResponse.json({ message: 'skillEstimates must contain numeric R, L, and/or W estimates' }, { status: 400 });
  }

  const token = await getToken();
  if (!token) {
    return NextResponse.json({ message: 'Unable to acquire session token' }, { status: 401 });
  }

  try {
    const plan = await apiFetch<OnboardingResponse>('/orchestrate/onboarding', {
      method: 'POST',
      token,
      body: {
        userId,
        currentLevel: body.currentLevel,
        dailyTimeBudgetMinutes: body.dailyTimeBudgetMinutes,
        goals: body.goals,
        ...(skillEstimates ? { skillEstimates } : {}),
      } satisfies OnboardingRequest,
    });

    return NextResponse.json(plan, { status: 201 });
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ message: error.message, body: error.body }, { status: error.status });
    }

    return NextResponse.json({ message: 'Unable to create your learning path right now.' }, { status: 502 });
  }
}
