create schema if not exists ank_pay_sandbox;
revoke all on schema ank_pay_sandbox from public, anon, authenticated;

create table if not exists ank_pay_sandbox.payments (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  request_fingerprint text not null,
  provider text not null,
  provider_reference text,
  merchant_transaction_id text,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency = 'ZAR'),
  reference text not null,
  product_key text not null,
  subject_type text not null,
  subject_id text not null,
  status text not null check (status in ('created','pending','awaiting_verification','succeeded','failed','expired','verification_failed','unknown')),
  provider_code text,
  metadata jsonb not null default '{}'::jsonb,
  status_verified_at timestamptz,
  settlement_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_reference),
  unique (provider, merchant_transaction_id)
);

create table if not exists ank_pay_sandbox.payment_events (
  id bigint generated always as identity primary key,
  payment_id uuid not null references ank_pay_sandbox.payments(id) on delete cascade,
  event_key text not null,
  event_type text not null,
  status text,
  provider_code text,
  provider_reference text,
  merchant_transaction_id text,
  provider_timestamp timestamptz,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (payment_id, event_key)
);

create table if not exists ank_pay_sandbox.entitlements (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references ank_pay_sandbox.payments(id) on delete restrict,
  product_key text not null,
  subject_type text not null,
  subject_id text not null,
  state text not null check (state in ('sandbox_active','sandbox_revoked')),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (payment_id, product_key, subject_type, subject_id)
);

create table if not exists ank_pay_sandbox.reconciliation_issues (
  id bigint generated always as identity primary key,
  payment_id uuid not null references ank_pay_sandbox.payments(id) on delete cascade,
  issue_code text not null,
  details jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ank_pay_payment_events_payment_id_idx on ank_pay_sandbox.payment_events(payment_id, occurred_at);
create index if not exists ank_pay_entitlements_subject_idx on ank_pay_sandbox.entitlements(subject_type, subject_id, state);
create index if not exists ank_pay_reconciliation_open_idx on ank_pay_sandbox.reconciliation_issues(payment_id) where resolved_at is null;

create or replace function ank_pay_sandbox.claim_payment_intent(
  p_idempotency_key text,
  p_request_fingerprint text,
  p_provider text,
  p_amount_minor bigint,
  p_currency text,
  p_reference text,
  p_product_key text,
  p_subject_type text,
  p_subject_id text,
  p_metadata jsonb default '{}'::jsonb
) returns table(payment_id uuid, replayed boolean)
language plpgsql
security invoker
set search_path = ank_pay_sandbox, pg_temp
as $$
declare
  v_existing ank_pay_sandbox.payments%rowtype;
  v_id uuid;
begin
  insert into ank_pay_sandbox.payments(
    idempotency_key, request_fingerprint, provider, amount_minor, currency, reference,
    product_key, subject_type, subject_id, status, metadata
  ) values (
    p_idempotency_key, p_request_fingerprint, p_provider, p_amount_minor, p_currency, p_reference,
    p_product_key, p_subject_type, p_subject_id, 'created', coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is not null then
    insert into ank_pay_sandbox.payment_events(payment_id,event_key,event_type,status)
    values (v_id, 'intent.claimed', 'intent.claimed', 'created')
    on conflict do nothing;
    return query select v_id, false;
    return;
  end if;

  select * into v_existing from ank_pay_sandbox.payments where idempotency_key = p_idempotency_key;
  if v_existing.request_fingerprint <> p_request_fingerprint then
    raise exception using errcode = 'P0001', message = 'ANK_PAY_IDEMPOTENCY_CONFLICT';
  end if;
  return query select v_existing.id, true;
end;
$$;

create or replace function ank_pay_sandbox.grant_verified_sandbox_entitlement(p_payment_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ank_pay_sandbox, pg_temp
as $$
declare
  v_payment ank_pay_sandbox.payments%rowtype;
  v_id uuid;
begin
  select * into v_payment from ank_pay_sandbox.payments where id = p_payment_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'ANK_PAY_PAYMENT_NOT_FOUND'; end if;
  if v_payment.status <> 'succeeded' or v_payment.settlement_verified_at is null then
    raise exception using errcode = 'P0003', message = 'ANK_PAY_UNVERIFIED_SETTLEMENT';
  end if;

  insert into ank_pay_sandbox.entitlements(payment_id, product_key, subject_type, subject_id, state)
  values (v_payment.id, v_payment.product_key, v_payment.subject_type, v_payment.subject_id, 'sandbox_active')
  on conflict (payment_id, product_key, subject_type, subject_id)
  do update set state = 'sandbox_active', revoked_at = null
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on all tables in schema ank_pay_sandbox from public, anon, authenticated;
revoke all on all sequences in schema ank_pay_sandbox from public, anon, authenticated;
revoke all on all functions in schema ank_pay_sandbox from public, anon, authenticated;

create or replace function ank_pay_sandbox.record_provider_result(
  p_payment_id uuid,
  p_event_key text,
  p_event_type text,
  p_reported_status text,
  p_provider_code text,
  p_provider_reference text,
  p_merchant_transaction_id text,
  p_provider_timestamp timestamptz default null
) returns ank_pay_sandbox.payments
language plpgsql
security invoker
set search_path = ank_pay_sandbox, pg_temp
as $$
declare
  v_payment ank_pay_sandbox.payments%rowtype;
begin
  select * into v_payment from ank_pay_sandbox.payments where id=p_payment_id for update;
  if not found then raise exception using errcode='P0002', message='ANK_PAY_PAYMENT_NOT_FOUND'; end if;

  if v_payment.provider_reference is not null and p_provider_reference is not null and v_payment.provider_reference <> p_provider_reference then
    insert into ank_pay_sandbox.reconciliation_issues(payment_id, issue_code, details)
    values (p_payment_id, 'provider_reference_mismatch', jsonb_build_object('incoming',p_provider_reference));
  end if;
  if v_payment.merchant_transaction_id is not null and p_merchant_transaction_id is not null and v_payment.merchant_transaction_id <> p_merchant_transaction_id then
    insert into ank_pay_sandbox.reconciliation_issues(payment_id, issue_code, details)
    values (p_payment_id, 'merchant_transaction_id_mismatch', jsonb_build_object('incoming',p_merchant_transaction_id));
  end if;

  update ank_pay_sandbox.payments
  set provider_reference = coalesce(provider_reference, p_provider_reference),
      merchant_transaction_id = coalesce(merchant_transaction_id, p_merchant_transaction_id),
      provider_code = coalesce(p_provider_code, provider_code),
      status = case
        when status='succeeded' then 'succeeded'
        when p_reported_status='succeeded' then 'awaiting_verification'
        else p_reported_status
      end,
      updated_at = now()
  where id=p_payment_id
  returning * into v_payment;

  insert into ank_pay_sandbox.payment_events(
    payment_id,event_key,event_type,status,provider_code,provider_reference,merchant_transaction_id,provider_timestamp
  ) values (
    p_payment_id,p_event_key,p_event_type,p_reported_status,p_provider_code,p_provider_reference,p_merchant_transaction_id,p_provider_timestamp
  ) on conflict (payment_id,event_key) do nothing;

  return v_payment;
end;
$$;

create or replace function ank_pay_sandbox.mark_verification(
  p_payment_id uuid,
  p_verified_status text,
  p_provider_code text,
  p_event_key text
) returns ank_pay_sandbox.payments
language plpgsql
security invoker
set search_path = ank_pay_sandbox, pg_temp
as $$
declare
  v_payment ank_pay_sandbox.payments%rowtype;
begin
  select * into v_payment from ank_pay_sandbox.payments where id=p_payment_id for update;
  if not found then raise exception using errcode='P0002', message='ANK_PAY_PAYMENT_NOT_FOUND'; end if;

  if v_payment.status='succeeded' and p_verified_status <> 'succeeded' then
    insert into ank_pay_sandbox.reconciliation_issues(payment_id,issue_code,details)
    values (p_payment_id,'verified_success_regression',jsonb_build_object('incoming_status',p_verified_status,'provider_code',p_provider_code));
  else
    update ank_pay_sandbox.payments
    set status=p_verified_status,
        provider_code=coalesce(p_provider_code,provider_code),
        status_verified_at=now(),
        settlement_verified_at=case when p_verified_status='succeeded' then coalesce(settlement_verified_at,now()) else settlement_verified_at end,
        updated_at=now()
    where id=p_payment_id
    returning * into v_payment;
  end if;

  insert into ank_pay_sandbox.payment_events(payment_id,event_key,event_type,status,provider_code)
  values (p_payment_id,p_event_key,'provider.verified',p_verified_status,p_provider_code)
  on conflict (payment_id,event_key) do nothing;
  return v_payment;
end;
$$;

create or replace function ank_pay_sandbox.record_verification_failure(
  p_payment_id uuid,
  p_reason text,
  p_event_key text
) returns ank_pay_sandbox.payments
language plpgsql
security invoker
set search_path = ank_pay_sandbox, pg_temp
as $$
declare
  v_payment ank_pay_sandbox.payments%rowtype;
begin
  select * into v_payment from ank_pay_sandbox.payments where id=p_payment_id for update;
  if not found then raise exception using errcode='P0002', message='ANK_PAY_PAYMENT_NOT_FOUND'; end if;
  if v_payment.status <> 'succeeded' then
    update ank_pay_sandbox.payments set status='verification_failed',updated_at=now() where id=p_payment_id returning * into v_payment;
  end if;
  insert into ank_pay_sandbox.reconciliation_issues(payment_id,issue_code,details)
  values (p_payment_id,'verification_failed',jsonb_build_object('reason',p_reason));
  insert into ank_pay_sandbox.payment_events(payment_id,event_key,event_type,status,details)
  values (p_payment_id,p_event_key,'verification.failed','verification_failed',jsonb_build_object('reason',p_reason))
  on conflict (payment_id,event_key) do nothing;
  return v_payment;
end;
$$;

revoke all on all functions in schema ank_pay_sandbox from public, anon, authenticated;
