import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import SubmitterView from './SubmitterView';
import ApproverView from './ApproverView';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Submitter flow — anyone with the base URL */}
        <Route path="/" element={<SubmitterView />} />

        {/* Approver portal — linked from email or typed directly */}
        <Route path="/approve" element={<ApproverView />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
