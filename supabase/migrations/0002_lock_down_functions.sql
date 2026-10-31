-- Nothing is callable without signing in; trigger functions are not callable as RPCs at all.
revoke execute on all functions in schema public from anon, public;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.sync_invoice_payments() from authenticated;
alter default privileges in schema public revoke execute on functions from anon, public;
