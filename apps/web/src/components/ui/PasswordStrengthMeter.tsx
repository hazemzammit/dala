'use client';

/**
 * apps/web/src/components/ui/PasswordStrengthMeter.tsx
 *
 * Doc 05 §2.5 — "Password strength meter: horizontal 3-segment bar beneath
 * the field (Faible/Moyen/Fort), colored danger→warning→success as it
 * fills — never a blocking wall, matching your resolved risk-register
 * decision." This is purely visual feedback; packages/validation's
 * passwordSchema (10-char minimum) is what actually gates submission, not
 * this meter's score.
 *
 * Scoring here is a deliberately simple heuristic (length + character
 * variety), not zxcvbn — swap in zxcvbn later if the heuristic proves too
 * generous/strict in practice; the component's interface won't need to change.
 */
function scorePassword(password: string): 0 | 1 | 2 | 3 {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 10) score++;
  if (password.length >= 14) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^a-zA-Z0-9]/.test(password)) score++;
  return Math.min(score, 3) as 0 | 1 | 2 | 3;
}

const LABELS = ['', 'Faible', 'Moyen', 'Fort'] as const;
const COLORS = ['bg-neutral-100', 'bg-danger', 'bg-warning', 'bg-success'] as const;

export function PasswordStrengthMeter({ password }: { password: string }) {
  const score = scorePassword(password);

  if (!password) return null;

  return (
    <div className="mt-1.5">
      <div className="flex gap-1.5">
        {[1, 2, 3].map((segment) => (
          <div
            key={segment}
            className={`h-1 flex-1 rounded-full transition-colors duration-150 ${
              segment <= score ? COLORS[score] : 'bg-neutral-100'
            }`}
          />
        ))}
      </div>
      {score > 0 && <p className="mt-1 text-xs text-neutral-500">{LABELS[score]}</p>}
    </div>
  );
}
