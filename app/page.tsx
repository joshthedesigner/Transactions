import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Analytics from '@/app/components/Analytics';
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
        <Analytics />
      </AppLayout>
    </FlowProvider>
  );
}

