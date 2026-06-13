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

-- Policies
create policy "Allow users to view their own profile" 
  on public.student_profiles for select 
  using (auth.uid() = user_id);

create policy "Allow users to insert their own profile" 
  on public.student_profiles for insert 
  with check (auth.uid() = user_id);

create policy "Allow users to update their own profile" 
  on public.student_profiles for update 
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
