CREATE TABLE balances (
  user        BYTEA  PRIMARY KEY,
  credit      BIGINT NOT NULL DEFAULT 0,   -- micro-USDC
  pending     BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE vouchers (
  user        BYTEA,
  nonce       BIGINT,
  max_debit   BIGINT,
  real_cost   BIGINT,
  redeemed_at TIMESTAMPTZ,
  PRIMARY KEY (user, nonce)
);
