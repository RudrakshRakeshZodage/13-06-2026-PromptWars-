-- Schema script to create student_profiles table in Supabase public schema
-- Run this in the Supabase SQL editor if not already present.

create table if not exists public.student_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  exam text not null,
  hours text not null,
  struggle text not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table public.student_profiles enable row level security;

-- Policies for student_profiles
drop policy if exists "Allow users to view their own profile" on public.student_profiles;
create policy "Allow users to view their own profile" 
  on public.student_profiles for select 
  using (auth.uid() = user_id);

drop policy if exists "Allow users to insert their own profile" on public.student_profiles;
create policy "Allow users to insert their own profile" 
  on public.student_profiles for insert 
  with check (auth.uid() = user_id);

drop policy if exists "Allow users to update their own profile" on public.student_profiles;
create policy "Allow users to update their own profile" 
  on public.student_profiles for update 
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Schema script to create mood_logs table in Supabase public schema
create table if not exists public.mood_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  content text not null,
  mood text not null,
  stress_triggers text[] not null,
  coping_strategy text not null,
  mindfulness_exercise text not null,
  encouragement text not null,
  resource jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS) for mood_logs
alter table public.mood_logs enable row level security;

-- Policies for mood_logs
drop policy if exists "Allow users to view their own mood logs" on public.mood_logs;
create policy "Allow users to view their own mood logs" 
  on public.mood_logs for select 
  using (auth.uid() = user_id);

drop policy if exists "Allow users to insert their own mood logs" on public.mood_logs;
create policy "Allow users to insert their own mood logs" 
  on public.mood_logs for insert 
  with check (auth.uid() = user_id);

drop policy if exists "Allow users to update their own mood logs" on public.mood_logs;
create policy "Allow users to update their own mood logs" 
  on public.mood_logs for update 
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Allow users to delete their own mood logs" on public.mood_logs;
create policy "Allow users to delete their own mood logs" 
  on public.mood_logs for delete 
  using (auth.uid() = user_id);

