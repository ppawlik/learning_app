import { useEffect, useRef } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { LearningsPage } from './features/learnings/LearningsPage';
import { LearningDetailPage } from './features/learnings/LearningDetailPage';
import { QuestionnairePage } from './features/questionnaires/QuestionnairePage';
import { SubmissionPage } from './features/submissions/SubmissionPage';

export function App() {
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);
  // After navigation, move focus to the top of the page for keyboard and screen-reader users.
  useEffect(() => {
    if (first.current) first.current = false;
    else main.current?.focus();
  }, [pathname]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-2">
        <Link to="/" className="text-xl font-semibold">
          Aplikacja do nauki
        </Link>
      </header>
      <main ref={main} tabIndex={-1} className="outline-none">
        <Routes>
          <Route path="/" element={<LearningsPage />} />
          <Route path="/learnings/:id" element={<LearningDetailPage />} />
          <Route path="/questionnaires/:id" element={<QuestionnairePage />} />
          <Route path="/submissions/:id" element={<SubmissionPage />} />
          <Route path="*" element={<p>Nie znaleziono strony.</p>} />
        </Routes>
      </main>
    </div>
  );
}
