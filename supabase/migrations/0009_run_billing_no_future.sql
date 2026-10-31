-- Billing invoices are now issued as confirmed (0007), so billing ahead of time would show customers
-- payable invoices for periods that haven't started. The app-facing RPC only bills up to today.
create or replace function public.run_billing(p_as_of date default current_date) returns json
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  if p_as_of is null or p_as_of > current_date then
    raise exception 'Billing can only run up to today (%)', current_date;
  end if;
  return public._run_billing(p_as_of);
end $$;
revoke all on function public.run_billing(date) from public, anon;
grant execute on function public.run_billing(date) to authenticated;
