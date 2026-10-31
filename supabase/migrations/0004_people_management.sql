-- All confirmed unpaid invoices contribute to the balance, independent of list pagination.
create or replace function public.customer_balance(p_customer_id uuid)
returns numeric language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(total - amount_paid), 0)
  from public.invoices where customer_id = p_customer_id and status = 'confirmed'
$$;
revoke all on function public.customer_balance(uuid) from public, anon;
grant execute on function public.customer_balance(uuid) to authenticated;

-- Only the server's service client can call this. The action supplies its verified caller.
-- Keep profile roles and trusted Auth metadata in the same transaction.
create or replace function public.set_account_role(p_actor uuid, p_profile uuid, p_role public.user_role)
returns void language plpgsql security definer set search_path = '' as $$
declare v_profile public.profiles;
begin
  perform pg_advisory_xact_lock(604031002);
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin') then
    raise exception 'Only admins can change roles' using errcode = '42501';
  end if;
  if p_role is null then raise exception 'Choose a role'; end if;
  select * into v_profile from public.profiles where id = p_profile for update;
  if not found then raise exception 'Account not found'; end if;
  if p_actor = p_profile and v_profile.role <> p_role then
    raise exception 'Ask another admin to change your own role';
  end if;
  -- A demoted staff member needs a linked billing contact to use the portal.
  -- Preserve all existing billing history when promoting or demoting an account.
  if p_role = 'customer' and not exists(select 1 from public.customers where user_id = p_profile) then
    insert into public.customers(user_id, name, email)
      values(p_profile, coalesce(nullif(v_profile.full_name, ''), v_profile.email), v_profile.email)
      on conflict(email) do update set user_id = excluded.user_id
      where public.customers.user_id is null;
    if not exists(select 1 from public.customers where user_id = p_profile) then
      raise exception 'This email is already linked to another customer account';
    end if;
  end if;
  update public.profiles set role = p_role where id = p_profile;
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', p_role)
    where id = p_profile;
  if not found then raise exception 'Auth account not found'; end if;
end $$;
revoke all on function public.set_account_role(uuid, uuid, public.user_role) from public, anon, authenticated;
grant execute on function public.set_account_role(uuid, uuid, public.user_role) to service_role;
