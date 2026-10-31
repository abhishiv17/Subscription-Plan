-- Phase 7: run billing automatically every day.
-- pg_cron runs in UTC. 00:30 UTC is 06:00 IST, when the UTC and IST dates agree, so
-- current_date inside _run_billing is the Indian business day.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

-- cron.schedule upserts by job name, so re-running this migration is safe.
select cron.schedule('daily-billing', '30 0 * * *', $$select public._run_billing();$$);

-- Staff can see whether the schedule exists and how its recent runs went (shown on the dashboard).
create or replace function public.billing_schedule_status()
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  v_job record;
begin
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  select jobid, schedule, active into v_job from cron.job where jobname = 'daily-billing';
  if not found then return json_build_object('scheduled', false); end if;
  return json_build_object(
    'scheduled', v_job.active,
    'schedule', v_job.schedule,
    'runs', (select coalesce(json_agg(r order by r.start_time desc), '[]'::json) from (
               select d.start_time, d.end_time, d.status, d.return_message
                 from cron.job_run_details d
                where d.jobid = v_job.jobid
                order by d.start_time desc
                limit 5) r)
  );
end $$;
revoke all on function public.billing_schedule_status() from public, anon;
grant execute on function public.billing_schedule_status() to authenticated;
