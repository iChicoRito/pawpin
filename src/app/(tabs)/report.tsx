import { Spinner } from 'heroui-native';
import { useEffect, useState } from 'react';

import { ReportCamera } from '@/components/report-camera';
import { ReportForm } from '@/components/report-form';
import { ReportPermissions } from '@/components/report-permissions';
import { ReportUnsent } from '@/components/report-unsent';
import { ThemedView } from '@/components/themed-view';
import { useSession } from '@/hooks/use-session';
import { loadUnsentReport, type ReportDraft } from '@/lib/reports';

// Phones only. Browsers get report.web.tsx.
export default function ReportScreen() {
  const { session } = useSession();
  const userId = session?.user.id;
  // No draft means the camera step; a draft means the form step.
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  // A report kept on the phone after a failed send. `undefined` until the phone has been asked.
  const [unsent, setUnsent] = useState<ReportDraft | null | undefined>(undefined);

  useEffect(() => {
    if (!userId) return;
    let isGone = false;
    loadUnsentReport(userId)
      .catch(() => null)
      .then((kept) => {
        if (!isGone) setUnsent(kept);
      });
    return () => {
      isGone = true;
    };
  }, [userId]);

  // Waiting here avoids opening the camera and then swapping it for the kept report.
  if (unsent === undefined) {
    return (
      <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </ThemedView>
    );
  }

  // One unsent report at a time: the camera stays shut until this one is sent or discarded.
  if (unsent) return <ReportUnsent draft={unsent} onGone={() => setUnsent(null)} />;

  return (
    <ReportPermissions>
      {draft ? (
        <ReportForm
          draft={draft}
          onRetake={() => setDraft(null)}
          onUnsent={(kept) => {
            setUnsent(kept);
            setDraft(null);
          }}
        />
      ) : (
        <ReportCamera onDone={setDraft} />
      )}
    </ReportPermissions>
  );
}
