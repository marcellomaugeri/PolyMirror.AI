```
npm install --prefix /Users/marcellomaugeri/Documents/PolyMirror.AI/mirror/backend && npm install --prefix /Users/marcellomaugeri/Documents/PolyMirror.AI/mirror/frontend && npm install --prefix /Users/marcellomaugeri/Documents/PolyMirror.AI/mirror @nomicfoundation/hardhat-toolbox @openzeppelin/contracts
```

# PolyMirror.AI : Pay AI with Polygon
Submission for the `Polygon Track` at the `Vibe Coding Hackathon` 2025 organised by the `Encode Club`.

## Executive Summary
Sam is a DeFAI dev which is implementing a trading agent on Polygon.
However, inference by local models is limited in performance, resulting in a big challenge since cryptomarkets could be highly volatile and speed is a key factor.
The alternative is to rely on cloud services which offer a good balance between costs and speed.
However, current AI services ask for an API key which can be obtained only with a card payment.
While credit cards backed by cryptocurrencies are spreading, issuing company cards can be daunting.

What if Sam leverages a small mirror which allow them to:
- Deposit `POL` into a dedicated `Channel`, increasing their `Balance`
- Each time an API call is sent, they attach a tiny ECDSA-signed `Voucher`
- The backend answers in real-time, claiming the effective costs from the `Voucher` later on
- When the `Balance` runs out, Sam (or the DAO) can top-up with a single transaction.

That's it! No banks, no paperwork.
Would it be awesome? Innit?
That mirror is here.
PolyMirror.AI is here.

## Workflow

## Demo
```
cd mirror
npx hardhat node # Start a local Hardhat node


## How it was developed
The `Vibe Coding Hackathon` requires to vibe code

### Setup
#### Design
-

#### Development
- VSCode with Github Copilot
- Model: Gemini 2.5 Pro

## Disclaimer (IMPORTANT!)
The code is just a working PoC using `OpenAI`'s API as an example.
As a consequence, note that using this code for the user described causes a violation to their terms of services.
Hence, use this code to test the idea with a single account.
Any misusage is not responsibility of the developers.