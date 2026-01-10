'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import DashboardV2 from '@/app/components/DashboardV2';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function DashboardV2Page() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    
    supabase.auth.getUser().then(({ data: { user }, error }) => {
      if (error || !user) {
        router.push('/login');
      } else {
        setUser(user);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.push('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  if (loading) {
    return (
      <FlowProvider>
        <AppLayout>
          <div className="min-h-screen flex items-center justify-center">
            <div className="text-lg">Loading...</div>
          </div>
        </AppLayout>
      </FlowProvider>
    );
  }

  return (
    <FlowProvider>
      <AppLayout>
        <DashboardV2 />
      </AppLayout>
    </FlowProvider>
  );
}

