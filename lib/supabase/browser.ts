'use client'
import { createBrowserClient } from '@supabase/ssr'
import { publicEnv } from '@/lib/env.public'

export function createBrowser() {
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey)
}
