import { Link, Route, Routes } from 'react-router-dom';
import { LearningsPage } from './features/learnings/LearningsPage';
import { LearningDetailPage } from './features/learnings/LearningDetailPage';
import { QuestionnairePage } from './features/questionnaires/QuestionnairePage';
import { SubmissionPage } from './features/submissions/SubmissionPage';

export function App() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-6">
        <Link to="/" className="text-xl font-semibold">
          Learning App
        </Link>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<LearningsPage />} />
          <Route path="/learnings/:id" element={<LearningDetailPage />} />
          <Route path="/questionnaires/:id" element={<QuestionnairePage />} />
          <Route path="/submissions/:id" element={<SubmissionPage />} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
    </div>
  );
}
