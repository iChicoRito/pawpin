import { useState } from 'react';

import { ReportCamera } from '@/components/report-camera';
import { ReportForm } from '@/components/report-form';
import { ReportPermissions } from '@/components/report-permissions';
import type { ReportDraft } from '@/lib/reports';

// Phones only. Browsers get report.web.tsx.
export default function ReportScreen() {
  // No draft means the camera step; a draft means the form step.
  const [draft, setDraft] = useState<ReportDraft | null>(null);

  return (
    <ReportPermissions>
      {draft ? (
        <ReportForm draft={draft} onRetake={() => setDraft(null)} />
      ) : (
        <ReportCamera onDone={setDraft} />
      )}
    </ReportPermissions>
  );
}
