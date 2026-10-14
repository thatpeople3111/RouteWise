begin;

create table public.user_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  preferred_transport_mode text not null
    constraint user_preferences_transport_mode_check
    check (preferred_transport_mode in ('PUBLIC_TRANSIT', 'DRIVING', 'WALKING', 'RIDESHARE')),
  max_walking_minutes integer
    constraint user_preferences_walking_minutes_check
    check (max_walking_minutes >= 0),
  max_budget numeric(10, 2)
    constraint user_preferences_budget_check
    check (max_budget between 0 and 99999999.99),
  route_priority text not null default 'BEST'
    constraint user_preferences_route_priority_check
    check (route_priority in ('BEST', 'FASTEST', 'CHEAPEST')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_preferences is
  'Optional travel defaults; one row per Supabase Auth user.';
comment on column public.user_preferences.max_walking_minutes is
  'Optional limit in whole minutes; NULL means no saved walking limit, zero is valid.';
comment on column public.user_preferences.max_budget is
  'Optional USD trip budget; NULL means no saved budget.';

create function public.set_user_preferences_timestamps()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    NEW.created_at := statement_timestamp();
    NEW.updated_at := NEW.created_at;
  else
    if NEW.user_id is distinct from OLD.user_id then
      raise exception 'Preference ownership cannot be changed' using errcode = '23514';
    end if;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := statement_timestamp();
  end if;
  return NEW;
end;
$$;

create trigger user_preferences_timestamps
before insert or update on public.user_preferences
for each row execute function public.set_user_preferences_timestamps();

alter table public.user_preferences enable row level security;

-- Remove inherited/default browser grants. Timestamps and ownership are not editable.
revoke all on table public.user_preferences from public, anon, authenticated;
grant select on table public.user_preferences to authenticated;
grant insert (user_id, preferred_transport_mode, max_walking_minutes, max_budget, route_priority)
  on public.user_preferences to authenticated;
grant update (preferred_transport_mode, max_walking_minutes, max_budget, route_priority)
  on public.user_preferences to authenticated;
revoke all on function public.set_user_preferences_timestamps() from public, anon, authenticated;

create policy user_preferences_select_own
on public.user_preferences for select to authenticated
using ((select auth.uid()) = user_id);

create policy user_preferences_insert_own
on public.user_preferences for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy user_preferences_update_own
on public.user_preferences for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

commit;
