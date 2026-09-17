/**
 * Supabase Client Configuration for AuraTrack Desktop
 */

const { createClient } = require('@supabase/supabase-js');

// Supabase Connection Credentials (matching AuraTrack platform)
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://xsthvcxkwhyjmjebqvvx.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzdGh2Y3hrd2h5am1qZWJxdnZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NzkyOTEsImV4cCI6MjEwNTE1NTI5MX0.7G2SvMNJv7podoMCIlsn8kmBj-MmF-kGOXyKPB6FFOc';

// Storage Endpoint
const STORAGE_BASE_URL = process.env.VITE_STORAGE_BASE_URL || 'https://storage.auratrack.io';

// Web application URL
const WEB_APP_URL = process.env.VITE_WEB_APP_URL || 'https://app.auratrack.io';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce'
  }
});

module.exports = {
  supabase,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  STORAGE_BASE_URL,
  WEB_APP_URL
};
