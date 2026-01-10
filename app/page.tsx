import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import DashboardV2 from '@/app/components/DashboardV2';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <FlowProvider>
      <AppLayout>
        <DashboardV2 />
      </AppLayout>
    </FlowProvider>
  );
}

