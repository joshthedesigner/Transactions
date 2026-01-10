// Test script to verify environment variables
require('dotenv').config({ path: '.env.local' });

console.log('Testing Environment Variables:\n');
console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL || 'NOT SET');
console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'SET (hidden)' : 'NOT SET');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'SET (hidden)' : 'NOT SET');
console.log('SUPABASE_DB_URL:', process.env.SUPABASE_DB_URL ? 'SET (hidden)' : 'NOT SET');

// Check if required vars are set
const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'OPENAI_API_KEY'];
const missing = required.filter(key => !process.env[key]);

if (missing.length === 0) {
  console.log('\n✅ All required environment variables are set!');
  process.exit(0);
} else {
  console.log('\n❌ Missing required environment variables:', missing.join(', '));
  process.exit(1);
}
