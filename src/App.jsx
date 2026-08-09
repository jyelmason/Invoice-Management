import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import SubmitterView from './SubmitterView';
import ApproverView from './ApproverView';
import MasterView from './MasterView';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Submitter flow — anyone with the base URL */}
        <Route path="/" element={<SubmitterView />} />

        {/* Approver portal — linked from email or typed directly */}
        <Route path="/approve" element={<ApproverView />} />

        {/* Master overview — every invoice/proposal, past and present */}
        <Route path="/master" element={<MasterView />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
