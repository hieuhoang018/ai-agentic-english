import Link from 'next/link';

type ExerciseNavigationProps = {
  currentQuestion: number;
  totalQuestions: number;
  previousHref?: string;
  nextHref?: string;
};

export default function ExerciseNavigation({
  currentQuestion,
  totalQuestions,
  previousHref,
  nextHref,
}: ExerciseNavigationProps) {
  return (
    <div className="mt-8 flex items-center justify-between">
      {previousHref ? (
        <Link
          href={previousHref}
          className="flex h-11 items-center justify-center gap-2 rounded-lg border border-outline px-6 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Quay lại
        </Link>
      ) : (
        <span className="h-11" />
      )}

      <span className="text-sm font-semibold text-on-surface-variant">
        Câu {currentQuestion} / {totalQuestions}
      </span>

      {nextHref ? (
        <Link
          href={nextHref}
          className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-white transition-colors hover:bg-[#0047bb]"
        >
          Tiếp tục
          <span className="material-symbols-outlined text-base">arrow_forward</span>
        </Link>
      ) : (
        <span className="h-11" />
      )}
    </div>
  );
}
