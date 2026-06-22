/**
 * Global test setup. Runs before any test module is imported, so env vars
 * read at module load time (JWT secret, Azure config) are deterministic.
 */

process.env.NODE_ENV = 'test';
process.env.NEXTAUTH_SECRET = 'test-secret-not-for-production';

// Azure OpenAI is always mocked in tests; provide dummy values so the client
// constructor does not throw on missing config.
process.env.AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || 'https://test.openai.azure.com/';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';
process.env.AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';

// Supabase client needs URL/key to construct; tests mock the data layer.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
