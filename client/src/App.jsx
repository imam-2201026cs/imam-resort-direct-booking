import { Routes, Route } from 'react-router-dom';

// Placeholder shell; real screens and the design system arrive in the UI phases.
export default function App() {
  return (
    <Routes>
      <Route path="*" element={<main className="p-8">Resort Direct</main>} />
    </Routes>
  );
}
