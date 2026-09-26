-- ANK Pay v0.3 incremental sandbox contract.
-- Extends the existing private fake-money ledger with authenticated webhook intake,
-- settlement Proof receipts, and reconciliation. No live-money capability is introduced.

create table if not exists ank_pay_sandbox.webhook_inbox (
  id bigint generated always as identity primary key,
  payment_id uuid not null references ank_pay_sandbox.payments(id) on delete cascade,
  provider text not null,
  webhook_id text not null,
  raw_hash text not null check (raw_hash ~ '^[0-9a-f]{64}$'),
  provider_reference text,
  merchant_transaction_id text,
  provider_code text,
  provider_timestamp timestamptz,
  status text,
  details jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  unique (provider, webhook_id)
);

create table if not exists ank_pay_sandbox.proof_receipts (
  id text primary key check (id ~ '^payr_[0-9a-f]{24}$'),
  payment_id uuid not null references ank_pay_sandbox.payments(id) on delete restrict,
  receipt_type text not null check (receipt_type = 'payment_settlement'),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  content jsonb not null,
  created_at timestamptz not null default now(),
  unique (payment_id, receipt_type)
);

create index if not exists ank_pay_webhook_payment_idx
  on ank_pay_sandbox.webhook_inbox(payment_id, received_at desc);
create index if not exists ank_pay_receipt_payment_idx
  on ank_pay_sandbox.proof_receipts(payment_id, created_at desc);

create or replace function ank_pay_sandbox.guard_verified_receipt()
returns trigger
language plpgsql
security invoker
set search_path = ank_pay_sandbox, pg_temp
as $$
declare
  v_payment ank_pay_sandbox.payments%rowtype;
begin
  select * into v_payment
  from ank_pay_sandbox.payments
  where id = new.payment_id;

  if not found then
    raise exception using errcode='P0002', message='ANK_PAY_PAYMENT_NOT_FOUND';
  end if;

  if v_payment.status <> 'succeeded' or v_payment.settlement_verified_at is null then
    raise exception using errcode='P0003', message='ANK_PAY_UNVERIFIED_SETTLEMENT_RECEIPT';
  end if;

  if coalesce(new.content->>'paymentId','') <> v_payment.id::text
     or coalesce(new.content->>'paymentStatus','') <> 'succeeded'
     or coalesce((new.content->>'amountMinor')::bigint,-1) <> v_payment.amount_minor
     or coalesce(new.content->>'currency','') <> v_payment.currency then
    raise exception using errcode='P0004', message='ANK_PAY_RECEIPT_PAYMENT_MISMATCH';
  end if;

  return new;
end;
$$;

drop trigger if exists ank_pay_verified_receipt_guard on ank_pay_sandbox.proof_receipts;
create trigger ank_pay_verified_receipt_guard
before insert or update
on ank_pay_sandbox.proof_receipts
for each row
execute function ank_pay_sandbox.guard_verified_receipt();

create or replace function ank_pay_sandbox.reconciliation_snapshot()
returns jsonb
language sql
stable
security invoker
set search_path = ank_pay_sandbox, pg_temp
as $$
with payment_rows as (
  select
    p.id,
    p.reference,
    p.product_key,
    p.subject_type,
    p.subject_id,
    p.status,
    p.amount_minor,
    p.currency,
    p.provider,
    p.provider_reference,
    p.merchant_transaction_id,
    p.provider_code,
    p.status_verified_at,
    p.settlement_verified_at,
    p.created_at,
    p.updated_at,
    (select count(*) from ank_pay_sandbox.reconciliation_issues i where i.payment_id=p.id and i.resolved_at is null) as open_issues,
    (select count(*) from ank_pay_sandbox.proof_receipts r where r.payment_id=p.id) as receipt_count,
    (select e.state from ank_pay_sandbox.entitlements e where e.payment_id=p.id order by e.granted_at desc limit 1) as entitlement_state,
    (select max(w.received_at) from ank_pay_sandbox.webhook_inbox w where w.payment_id=p.id) as last_webhook_at
  from ank_pay_sandbox.payments p
  order by p.created_at desc
  limit 250
)
select jsonb_build_object(
  'generatedAt', now(),
  'totals', jsonb_build_object(
    'payments', (select count(*) from ank_pay_sandbox.payments),
    'succeeded', (select count(*) from ank_pay_sandbox.payments where status='succeeded'),
    'pending', (select count(*) from ank_pay_sandbox.payments where status in ('created','pending','awaiting_verification','unknown')),
    'openIssues', (select count(*) from ank_pay_sandbox.reconciliation_issues where resolved_at is null),
    'receipts', (select count(*) from ank_pay_sandbox.proof_receipts),
    'webhooks', (select count(*) from ank_pay_sandbox.webhook_inbox)
  ),
  'rows', coalesce((select jsonb_agg(to_jsonb(payment_rows)) from payment_rows),'[]'::jsonb)
);
$$;

revoke all on ank_pay_sandbox.webhook_inbox from public, anon, authenticated;
revoke all on ank_pay_sandbox.proof_receipts from public, anon, authenticated;
revoke all on function ank_pay_sandbox.guard_verified_receipt() from public, anon, authenticated;
revoke all on function ank_pay_sandbox.reconciliation_snapshot() from public, anon, authenticated;

grant usage on schema ank_pay_sandbox to service_role;
grant select, insert on ank_pay_sandbox.webhook_inbox to service_role;
grant select, insert on ank_pay_sandbox.proof_receipts to service_role;
grant execute on function ank_pay_sandbox.reconciliation_snapshot() to service_role;

comment on table ank_pay_sandbox.proof_receipts is
'ANK Pay internal Proof receipts. A receipt can exist only after independent provider status verification confirms settlement.';
comment on table ank_pay_sandbox.webhook_inbox is
'Authenticated Peach webhook metadata. Raw encrypted/decrypted webhook bodies are not retained; only a SHA-256 raw hash and reconciliation fields are stored.';
