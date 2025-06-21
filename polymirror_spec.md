# PolyMirror.AI — Implementation Brief  
*(hand this to the engineer who will actually write the code)*  

---

## 0 Executive summary — the story

> **Alice** is a Solidity dev at a DAO that holds its treasury in MATIC and stablecoins on Polygon.  
> She wants to plug OpenAI into her on‑chain support bot, but OpenAI’s dashboard insists on a credit‑card.  
> Getting a corporate Visa means …  
> *KYC hoops, fiat off‑ramp fees, monthly reconciliation, and a single human holding the card details.*

So Alice builds a small bridge:

* She swaps a bit of DAO USDC into a **PolyMirrorChannel**, a contract that keeps the funds earmarked for her wallet.  
* Each time the bot calls the API it hands over a tiny **voucher** signed by the DAO’s key.  
* The backend answers in real time, then—once an hour—settles those vouchers on Polygon in a single, sub‑cent transaction.  
* If the DAO tops up or cashes out, it’s just another Polygon tx—no banks, no spreadsheets.

That bridge **is** PolyMirror.AI.  
It lets any Polygon address—human, bot, or contract—pay OpenAI in native tokens while keeping custody of its crypto. No fiat rails, no latency, no trust in middlemen.

---

## 1 High-level architecture  

```text
frontend / SDK        backend (Node.js)             Polygon PoS
┌───────────────┐     ┌───────────────────────────┐  ┌────────────────────────────┐
│  React + wagmi│⇄WS  │ watcher.js  (events)      │  │  PolyMirrorChannel.sol     │
│  ethers v6    │–––▶ │ mirror.js   (API proxy)   │⇆ │  – Uniswap swap            │
└───────────────┘     │ redeemJob.js (cron)       │  │  – Per-user escrow channel │
                      │ claim.js (manual)         │  └────────────────────────────┘
                      └───────────────────────────┘
```

---

## 2 Repo / directory layout  

```
mirror/
├─ contracts/
│  ├─ PolyMirrorChannel.sol   # deposit+swap+channel
│  └─ VoucherLib.sol          # EIP-712 encoder
├─ scripts/
│  ├─ deploy.js               # Hardhat deploy to Mumbai
│  └─ verify.js               # Polygonscan verification
├─ backend/
│  ├─ .env.example
│  ├─ watcher.js              # listens Deposit / ChannelToppedUp
│  ├─ mirror.js               # Express REST proxy to OpenAI
│  ├─ redeemJob.js            # hourly voucher-batch redeem
│  └─ claim.js                # owner withdraw USDC
├─ sql/
│  └─ schema.sql              # Postgres DDL
└─ frontend/
   ├─ src/
   │  ├─ App.tsx              # React demo
   │  └─ hooks/useVoucher.ts  # helper to sign vouchers
   └─ vite.config.ts
```

---

## 3 Smart‑contract design — **PolyMirrorChannel.sol** (Solidity ^0.8.23)

### 3.1 State

```solidity
IERC20       public usdc;            // 6‑decimals
ISwapRouter  public router;          // Uniswap V3
mapping(address => uint256) public channel;      // escrowed micro‑USDC
mapping(address => mapping(uint256 => bool)) public nonceUsed;
```

### 3.2 Events

```solidity
event Deposit(        address indexed user, address tokenIn, uint256 usdcOut);
event ChannelToppedUp(address indexed user,             uint256 amount, uint256 newBal);
event VoucherRedeemed(address indexed user,             uint256 amount);
event ChannelClosed(  address indexed user,             uint256 amount);
```

### 3.3 Key functions

| fn | purpose |
|----|---------|
| `depositWithSwap(tokenIn, fee, amt, minUsdc)` | swap **any token or WMATIC** → USDC → `channel[user] += usdcOut` |
| `topUpChannel(uint256 usdcAmt)` | direct USDC `transferFrom`; same `channel+` |
| `openChannel(uint256 usdcAmt)` | alias for first top‑up |
| `redeem(Voucher v, uint256 amount, bytes sig)` | hour‑batch pull (`amount ≤ v.maxDebit`, `!nonceUsed`) |
| `closeChannel(uint256 amt)` | withdraw leftovers (only when off‑chain `pendingCount == 0`) |
| `claim(uint256 amt)` *(onlyOwner)* | move accumulated revenue to treasury |

#### Voucher struct

```solidity
// keccak256("Voucher(address channel,uint256 maxDebit,uint256 nonce,uint256 deadline)")
struct Voucher {
    address channel;
    uint256 maxDebit;   // micro‑USDC
    uint256 nonce;
    uint256 deadline;
}
```

*(The signer can issue many vouchers off‑chain; each nonce can be redeemed once.)*

---

## 4 Backend components  

| file | job |
|------|-----|
| **watcher.js** | listens `Deposit` / `ChannelToppedUp`, increments `credit` in DB |
| **mirror.js** (Express) | reserves `maxDebit`, calls OpenAI, reconciles real cost, queues voucher |
| **redeemJob.js** | hourly batch `redeem()` calls |
| **claim.js** | owner withdraws profit when escrow > threshold |

### Database schema (Postgres)

```sql
CREATE TABLE balances (
  user        BYTEA  PRIMARY KEY,
  credit      BIGINT NOT NULL DEFAULT 0,   -- micro‑USDC
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
```

*(SQLite is fine for PoC.)*

---

## 5 Frontend / SDK notes  

* **wagmi + ethers v6**.  
* Deposit modal → fetch quote from 0x API → build `depositWithSwap()` tx.  
* `useVoucher()` hook signs fresh EIP‑712 with buffer (`maxDebit = estCost × 1.25`).  
* Request body example:

```json
{
  "channel": "0xAbc…",
  "voucher": { … },
  "sig": "0x…",
  "messages": [{ "role":"user", "content":"Hello"}],
  "model": "gpt-3.5-turbo"
}
```

* Display balance via WebSocket or `/balance` poll.

---

## 6 Operational defaults

| parameter | value |
|-----------|-------|
| Swap slippage | 0.5 % |
| Voucher expiry | `now + 1 h` |
| Batch interval | 60 min or 200 vouchers |
| OpenAI price table | `{ "gpt-3.5-turbo":0.0015, "gpt-4o":0.005 }` USD / 1 K tokens |
| Safety buffer | `maxDebit = estCost × 1.25` |

---

## 7 Security checklist  

1. State‑before‑external → no re‑entrancy.  
2. Unique nonce enforced; duplicate voucher reverts.  
3. Front‑end passes `minUsdc` to stop slippage griefing.  
4. `redeemJob` retries individual failures; voucher stays pending until redeemed.  
5. Owner & treasury keys live in a 2/3 Gnosis Safe before production.

---

## 8 Road‑map after PoC  

| Stage | Feature |
|-------|---------|
| **v1** | Meta‑tx relay (Biconomy) for gasless deposits; tiktoken counting |
| **v2** | Superfluid subscription channel; on‑chain AIOracle for contracts |
| **v3** | Polygon‑ID‑gated premium tiers; zkEVM migration for gas shaving |
