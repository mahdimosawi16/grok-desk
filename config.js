/* Public app config. Anon key is safe to embed (RLS: SELECT only). Writer secret never here. */
window.DESK_CONFIG = {
  supabaseUrl: 'https://utlybsuqokbgjlzgtlmo.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0bHlic3Vxb2tiZ2psemd0bG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5NjQwODcsImV4cCI6MjEwOTU0MDA4N30.V7jDZwHRM9iAgACv13ml9yZbxP_CAOQoOj6-2LPJtRs',
  // optional Pages JSON fallback if #d= set and supabase down
  dataPath: null,
};
