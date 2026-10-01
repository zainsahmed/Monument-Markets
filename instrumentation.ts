export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.SKIP_ENV_VALIDATION !== '1') {
    const { getEnv } = await import('./lib/env')
    getEnv() // fail loudly at startup if anything is missing
  }
}
