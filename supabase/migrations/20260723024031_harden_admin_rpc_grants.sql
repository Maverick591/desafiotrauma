-- Supabase projects created before explicit Data API grants can retain direct
-- EXECUTE privileges for anon/authenticated/service_role when a function is
-- replaced. Converge every privileged RPC to the intended least-privilege ACL.

revoke all on function public.is_admin() from public, anon, authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;

revoke all on function public.get_public_dashboard_snapshot() from public, anon, authenticated, service_role;
grant execute on function public.get_public_dashboard_snapshot() to anon, authenticated, service_role;

revoke all on function public.review_feedback(uuid, public.feedback_review_status, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.review_feedback(uuid, public.feedback_review_status, text, text, text)
  to authenticated;

revoke all on function public.review_question(uuid, text, text, text, text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.review_question(uuid, text, text, text, text, text, text, text, text)
  to authenticated;

revoke all on function public.replace_mentimeter_presentation(jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.replace_mentimeter_presentation(jsonb, jsonb, jsonb, jsonb)
  to service_role;

revoke all on function public.publish_dashboard_snapshot(uuid, text, jsonb, integer, text, jsonb, jsonb, bigint, bigint, bigint, numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.publish_dashboard_snapshot(uuid, text, jsonb, integer, text, jsonb, jsonb, bigint, bigint, bigint, numeric)
  to service_role;
