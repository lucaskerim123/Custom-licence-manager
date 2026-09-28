-- Keep normal customer issuance at one current Base licence per product.
-- Explicit administrative override licences are separate licence sets and may
-- coexist on the same customer account.

drop index if exists public.licenses_one_current_customer_product_uidx;

create unique index licenses_one_current_customer_product_uidx
  on public.licenses(product_id, customer_external_id)
  where customer_external_id is not null
    and status not in ('revoked','expired')
    and customer_override = false;
