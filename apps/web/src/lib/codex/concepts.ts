// ─────────────────────────────────────────────────────────────────────────────
// Codex Academy — DeFi Concept Entries
// 20 foundational concepts, plain-language first, always go-deeper optional
// ─────────────────────────────────────────────────────────────────────────────

import type { CodexConceptEntry } from './types'

export const CODEX_CONCEPTS: CodexConceptEntry[] = [
  {
    key: 'apy-vs-apr',
    term: 'APY vs APR',
    simple: 'APY includes compounding — your earnings earn earnings. APR does not.',
    detail:
      'APR (Annual Percentage Rate) is a flat measure of the yearly interest you earn on your principal. ' +
      'APY (Annual Percentage Yield) layers in the effect of compounding — meaning interest earned each period ' +
      'gets added back and earns its own interest. The more frequently interest compounds, the wider the gap ' +
      'between APR and APY. Most DeFi protocols display APY because it reflects what you actually receive ' +
      'if earnings are continuously reinvested.',
    analogy:
      'Think of APR as a salary paid once a year. APY is the same salary, but you invest each paycheck immediately ' +
      'and every dollar starts earning on its own — by year-end you have noticeably more.',
    relatedKeys: ['compounding', 'blended-apy', 'organic-vs-incentive-yield'],
  },

  {
    key: 'organic-vs-incentive-yield',
    term: 'Organic vs Incentive Yield',
    simple:
      'Organic yield comes from real economic activity (borrowers paying interest). Incentive yield is bonus tokens the protocol adds to attract users.',
    detail:
      'Organic yield is durable — it exists as long as people need to borrow or trade. ' +
      'Incentive yield is a marketing spend: protocols reward early depositors with their own tokens ' +
      'to bootstrap liquidity. These rewards tend to shrink as the protocol matures, or vanish entirely ' +
      'if the token price drops. A strategy showing 18% APY where 14% is incentive tokens and only 4% ' +
      'is organic is far more fragile than one showing 8% that is 100% organic.',
    analogy:
      'Organic yield is a business that earns revenue from customers. Incentive yield is a sign-up bonus ' +
      'from a credit card — valuable today, but it ends.',
    relatedKeys: ['apy-vs-apr', 'protocol-tvl', 'stability-score'],
  },

  {
    key: 'liquidity-windows',
    term: 'Liquidity Windows',
    simple: 'How quickly you can get your money back — instant, same-day, or on a schedule.',
    detail:
      'Every yield strategy has a liquidity window — the practical time between deciding to exit and receiving your funds. ' +
      'Instant liquidity means you withdraw and funds arrive within the same blockchain transaction (seconds). ' +
      'Same-day means a settlement queue that clears within hours. ' +
      'Scheduled means your capital is locked to a fixed maturity date — like a 30-day or 90-day term — ' +
      'and early exit may not be possible or incurs a penalty. ' +
      'Higher yields often come with longer liquidity windows because the protocol needs predictable capital.',
    analogy:
      'A checking account is instant liquidity. A 3-month CD is scheduled liquidity — higher interest, ' +
      'but the bank holds your deposit until the term ends.',
    relatedKeys: ['epoch-harvesting', 'fixed-vs-variable-rate', 'collateralization'],
  },

  {
    key: 'smart-contracts',
    term: 'Smart Contracts',
    simple:
      'Code that holds and moves money automatically — no bank, no middleman, no manual approval.',
    detail:
      'A smart contract is a program deployed to a blockchain that executes predefined rules exactly as written. ' +
      'When you deposit into a DeFi protocol, your funds go into a smart contract, not a company account. ' +
      'The contract automatically handles lending, repayment, and yield distribution based on its code. ' +
      'This removes counterparty risk from institutions but introduces smart contract risk — ' +
      'if the code has a bug, an attacker can drain it. Major protocols undergo multiple independent audits ' +
      'to reduce this risk.',
    analogy:
      'A smart contract is like a vending machine: put money in, select an option, receive exactly what the ' +
      'machine is programmed to deliver — no cashier needed, but the machine itself must work correctly.',
    relatedKeys: ['protocol-tvl', 'erc-4626', 'collateralization'],
  },

  {
    key: 'stablecoins',
    term: 'Stablecoins',
    simple: 'Crypto tokens designed to hold a fixed value — usually $1.00 — so your principal does not fluctuate.',
    detail:
      'Stablecoins are the foundation of DeFi yield strategies because they remove price volatility from the equation. ' +
      'Fiat-backed stablecoins (USDC, USDT) are redeemable 1:1 for a US dollar held in a bank. ' +
      'Overcollateralized stablecoins (DAI, USDS) are minted by locking more crypto value than is borrowed. ' +
      'Algorithmic stablecoins maintain their peg through supply mechanics rather than reserves — ' +
      'these carry the highest depeg risk. Genesis strategies use only regulated, audited stablecoins ' +
      'to protect your principal.',
    analogy:
      'A stablecoin is like a casino chip that is always redeemable for exactly one dollar — ' +
      'except instead of a casino cage, redemption is enforced by code or dollar reserves.',
    relatedKeys: ['collateralization', 'smart-contracts', 'risk-tiers'],
  },

  {
    key: 'inflation-hedging',
    term: 'Inflation Hedging',
    simple: 'Earning enough yield so that your money\'s real purchasing power does not shrink over time.',
    detail:
      'Inflation erodes the value of idle cash — $1,000 earning 0% in a savings account is worth less ' +
      'in real terms each year. Historically, US inflation runs 2-4% annually. ' +
      'A Preserve-tier strategy yielding 5% means you are gaining roughly 1-3% in real terms after inflation. ' +
      'A Grow-tier strategy at 10-14% compounds your real purchasing power meaningfully. ' +
      'The Genesis platform targets yields that outpace inflation in every tier, turning cash from a depreciating ' +
      'asset into an appreciating one.',
    analogy:
      'Inflation is a slow drain on your financial bathtub. Yield is the faucet. ' +
      'Your goal is to run the faucet faster than the drain empties it.',
    relatedKeys: ['apy-vs-apr', 'risk-tiers', 'blended-apy'],
  },

  {
    key: 'risk-tiers',
    term: 'Risk Tiers',
    simple: 'Preserve keeps your principal safe. Grow targets higher returns with some risk. Accelerate pursues maximum yield with full risk awareness.',
    detail:
      'Genesis organizes strategies into three tiers based on a composite risk score. ' +
      'Preserve strategies target 4-9% APY using only the most battle-tested protocols with instant liquidity and low smart contract risk. ' +
      'Grow strategies target 8-18% APY with moderate risk — often fixed-rate, institutional, or curated lending. ' +
      'Accelerate strategies target 15-50% APY using leverage, funding rates, or concentrated positions — ' +
      'appropriate only for capital you can afford to lose if market conditions shift sharply. ' +
      'Your portfolio blends all three tiers based on your financial goals.',
    analogy:
      'Preserve is a high-yield savings account. Grow is a diversified bond portfolio. ' +
      'Accelerate is an actively managed equity fund with leverage.',
    relatedKeys: ['inflation-hedging', 'blended-apy', 'rebalancing'],
  },

  {
    key: 'compounding',
    term: 'Compounding',
    simple: 'Reinvesting your earnings so they earn their own earnings — your growth accelerates over time.',
    detail:
      'Compounding is the process of adding earned yield back to your principal, so the next period\'s yield ' +
      'is calculated on a larger base. In DeFi, many protocols auto-compound continuously — ' +
      'every block, earned interest is added back. This is why the APY display is almost always higher than APR. ' +
      'At 10% APY compounded daily, $10,000 becomes $11,051.56 in a year. ' +
      'At the same 10% compounded annually, you only receive $11,000 — a $51.56 difference from compounding alone. ' +
      'Over years and larger principals, the gap widens dramatically.',
    analogy:
      'A snowball rolling downhill grows faster as it gets larger — each rotation adds more snow than the last. ' +
      'That\'s compounding: your money\'s "snowball" grows with every earning cycle.',
    relatedKeys: ['apy-vs-apr', 'blended-apy', 'epoch-harvesting'],
  },

  {
    key: 'fixed-vs-variable-rate',
    term: 'Fixed-Rate vs Variable-Rate',
    simple: 'Fixed rate locks in a yield percentage for a set period. Variable rate floats with market demand.',
    detail:
      'Variable-rate yield (most lending protocols) fluctuates daily based on how much demand there is for borrowing. ' +
      'When demand is high, rates rise. When liquidity floods in, rates compress. ' +
      'Fixed-rate yield (Pendle, Notional, Term) lets you lock in today\'s rate until maturity — ' +
      'if rates fall after you lock, you keep the higher rate. If rates rise, you missed the upside. ' +
      'The tradeoff: fixed-rate usually requires holding until the maturity date (scheduled liquidity), ' +
      'while variable-rate offers instant withdrawal.',
    analogy:
      'A 30-year fixed mortgage gives you certainty — your payment never changes. ' +
      'An adjustable-rate mortgage floats with the market. Fixed-rate DeFi yield works the same way.',
    relatedKeys: ['liquidity-windows', 'epoch-harvesting', 'compounding'],
  },

  {
    key: 'collateralization',
    term: 'Collateralization',
    simple: 'Borrowers must lock up more value than they borrow, protecting your deposited funds.',
    detail:
      'In lending protocols like Aave and Compound, borrowers must post collateral worth more than their loan — ' +
      'typically 130-150% of the loan value. If the collateral value drops below the required threshold, ' +
      'the protocol automatically liquidates it (sells it) to repay lenders. ' +
      'This over-collateralization is the core safety mechanism that protects depositor capital. ' +
      'It also means DeFi lending avoids the default risk of unsecured loans, ' +
      'though collateral crashes can occasionally outpace liquidation engines during extreme market events.',
    analogy:
      'When you take a mortgage, the bank holds your house as collateral — if you stop paying, they sell it. ' +
      'DeFi lending works identically, but the collateral is crypto and liquidation is instant and automated.',
    relatedKeys: ['smart-contracts', 'stablecoins', 'risk-tiers'],
  },

  {
    key: 'protocol-tvl',
    term: 'Protocol TVL',
    simple: 'Total Value Locked — the total amount of money currently deposited in a protocol. A proxy for trust and battle-testing.',
    detail:
      'TVL (Total Value Locked) is the dollar value of all assets currently held in a protocol\'s smart contracts. ' +
      'A protocol with $5B TVL has been trusted with $5B of real capital — hackers have attempted to exploit it ' +
      'far more aggressively than a $10M protocol, and it has survived. ' +
      'TVL is a useful trust signal, not a guarantee — but all else equal, a higher-TVL protocol has a longer ' +
      'public track record under real market conditions. Genesis enforces minimum TVL thresholds per protocol ' +
      'to filter out unproven protocols from the Yield Monitor.',
    analogy:
      'TVL is like a restaurant\'s daily customer count. A packed restaurant that has been open 5 years ' +
      'is a different risk than a new place with no customers — the crowd is evidence that people trust the kitchen.',
    relatedKeys: ['smart-contracts', 'organic-vs-incentive-yield'],
  },

  {
    key: 'impermanent-loss',
    term: 'Impermanent Loss',
    simple: 'A loss in value that can occur when providing liquidity to trading pools — if prices move, you may receive less than you deposited.',
    detail:
      'When you provide liquidity to a decentralized exchange (like Uniswap), you deposit two assets in a ratio. ' +
      'If one asset\'s price moves significantly relative to the other, the pool\'s automated balancing algorithm ' +
      'sells your appreciated asset and buys more of the depreciated one. When you withdraw, ' +
      'you may receive less total value than if you had simply held the two assets separately. ' +
      'This "loss" is "impermanent" because if prices return to the entry ratio before you exit, it reverses. ' +
      'Genesis Preserve and Grow strategies avoid liquidity provision pools entirely. ' +
      'Stablecoin-only pairs (USDC/USDT) have near-zero impermanent loss risk.',
    analogy:
      'Imagine agreeing to always keep exactly half your wallet in dollars and half in gold. ' +
      'If gold doubles, you\'ll automatically sell some gold for dollars — and if gold crashes back, ' +
      'you\'ll have fewer gold coins than if you\'d just held them.',
    relatedKeys: ['stablecoins', 'risk-tiers', 'collateralization'],
  },

  {
    key: 'delta-neutral',
    term: 'Delta-Neutral Strategies',
    simple: 'A position designed to earn yield regardless of whether markets go up or down, by balancing opposing bets.',
    detail:
      'A delta-neutral strategy offsets market exposure so that price movements in either direction do not affect ' +
      'your principal. For example, Ethena\'s sUSDe holds spot stETH while simultaneously shorting ETH futures — ' +
      'if ETH rises 20%, the spot position gains 20% and the short loses 20%, netting zero price exposure. ' +
      'What remains is the funding rate premium paid to the short position, which becomes the yield. ' +
      'The risk is not price direction but funding rate flipping negative — in extreme bear markets, ' +
      'short-sellers sometimes pay longs, compressing or reversing the yield.',
    analogy:
      'A casino that bets equally on red and black every spin cannot lose to the spin outcome — ' +
      'it profits only from the house edge on each bet. Delta-neutral strategies harvest a "house edge" (the funding rate) ' +
      'without caring which way prices move.',
    relatedKeys: ['funding-rates', 'risk-tiers', 'organic-vs-incentive-yield'],
  },

  {
    key: 'funding-rates',
    term: 'Funding Rates',
    simple: 'Periodic payments between long and short traders in futures markets — a source of yield for delta-neutral strategies.',
    detail:
      'Perpetual futures contracts use funding rates to keep the futures price anchored to the spot price. ' +
      'When more traders want to go long (bullish), they pay a funding rate to short-sellers every 8 hours. ' +
      'In sustained bull markets, this funding rate can be 20-60% annualized — ' +
      'strategies that hold the short side collect this premium as yield. ' +
      'When sentiment turns bearish, funding flips: longs collect and shorts pay. ' +
      'Ethena monitors funding across multiple exchanges and can hold reserves to cushion negative funding periods.',
    analogy:
      'Funding rates are like a toll road where direction of traffic determines who pays. ' +
      'If 80% of cars drive north, northbound drivers pay southbound drivers a toll every 8 hours. ' +
      'Delta-neutral strategies drive south while everyone rushes north.',
    relatedKeys: ['delta-neutral', 'risk-tiers', 'fixed-vs-variable-rate'],
  },

  {
    key: 'tokenized-treasuries',
    term: 'T-Bills / Tokenized Treasuries',
    simple: 'US government bonds brought on-chain — the safest yield in the world, now accessible in a crypto wallet.',
    detail:
      'US Treasury Bills are short-duration government bonds backed by the full faith and credit of the United States. ' +
      'Tokenized treasuries (Ondo\'s OUSG, BlackRock\'s BUIDL, Superstate\'s USTB) wrap real T-Bill holdings ' +
      'in an ERC-20 token, letting you earn T-Bill yields — currently 4.5-5.5% — directly on-chain. ' +
      'The yield comes from the underlying government securities, not from DeFi mechanics, ' +
      'making this the most sovereign-grade income available in crypto. ' +
      'Access historically required $1M+ minimum investments; tokenization breaks this down to any amount.',
    analogy:
      'Imagine buying a slice of a government bond portfolio — the kind pension funds use — ' +
      'except instead of a brokerage account minimum, you need just a crypto wallet and $1.',
    relatedKeys: ['stablecoins', 'risk-tiers', 'inflation-hedging'],
  },

  {
    key: 'erc-4626',
    term: 'ERC-4626',
    simple: 'The universal standard that lets DeFi vaults plug into wallets and apps without custom code for each one.',
    detail:
      'ERC-4626 is an Ethereum token standard that defines a common interface for yield-bearing vaults. ' +
      'Before ERC-4626, every protocol had its own deposit/withdraw functions, requiring custom integration work. ' +
      'Now, any ERC-4626 vault can be read and interacted with using the same standard calls — ' +
      'how many shares you own, what they\'re worth, how to deposit and withdraw. ' +
      'This is how Genesis can scan and deploy to dozens of protocols through a single abstraction layer, ' +
      'and why your Genesis wallet can rebalance across protocols without manual steps.',
    analogy:
      'ERC-4626 is like a universal power adapter — the same plug works in every country\'s outlet. ' +
      'Before it, every DeFi protocol had its own proprietary socket.',
    relatedKeys: ['smart-contracts', 'protocol-tvl', 'rebalancing'],
  },

  {
    key: 'epoch-harvesting',
    term: 'Epoch Harvesting',
    simple: 'Some protocols accumulate yield in batches rather than continuously — you collect it at the end of fixed periods.',
    detail:
      'Fixed-rate and some institutional protocols (Pendle, Notional, Term) operate in epochs — ' +
      'discrete time windows (7, 30, or 90 days) where your capital is committed and yield accrues. ' +
      'At epoch end, the full term\'s yield is distributed and you choose to reinvest or withdraw. ' +
      'Epoch harvesting is efficient (lower gas costs) and provides rate certainty for the period, ' +
      'but it means liquidity is only available at defined intervals, not on demand. ' +
      'Genesis shows upcoming epoch maturity dates on each strategy card.',
    analogy:
      'A quarterly dividend stock pays you four times a year, not daily. ' +
      'You know the payment schedule upfront. Epoch harvesting works the same way.',
    relatedKeys: ['fixed-vs-variable-rate', 'liquidity-windows', 'compounding'],
  },

  {
    key: 'gas-fees',
    term: 'Gas Fees (and Why Genesis Is Free)',
    simple: 'Blockchain transactions normally cost a small fee paid to network validators. Genesis absorbs this cost for you.',
    detail:
      'Every action on Ethereum — depositing, withdrawing, rebalancing — requires a "gas" fee paid in ETH ' +
      'to compensate validators who process the transaction. Fees range from cents to tens of dollars ' +
      'depending on network congestion. For small accounts, frequent gas payments erode yield meaningfully. ' +
      'Genesis uses ERC-4337 smart accounts (account abstraction) to batch and sponsor gas, ' +
      'meaning the protocol pays gas on your behalf. You experience gasless transactions — ' +
      'deposit, withdraw, rebalance — without ever holding ETH for fees.',
    analogy:
      'Online bank transfers used to cost $3 per wire. Now most banks cover this fee for customers. ' +
      'Genesis does the same: we absorb network costs so you keep 100% of your yield.',
    relatedKeys: ['smart-contracts', 'erc-4626', 'rebalancing'],
  },

  {
    key: 'blended-apy',
    term: 'Blended APY',
    simple: 'The weighted average yield across your entire portfolio — a single number reflecting what all three tiers are collectively earning.',
    detail:
      'Your Genesis portfolio holds allocations across Preserve, Grow, and Accelerate strategies simultaneously. ' +
      'Blended APY weights each strategy\'s current yield by its share of your total balance. ' +
      'For example: $5,000 in Preserve at 5.2% + $3,000 in Grow at 11.4% + $2,000 in Accelerate at 18% = ' +
      'a blended APY of roughly 9.62%. This is the number that tells you your total portfolio\'s annual earning rate. ' +
      'As markets move and strategies are rebalanced, blended APY updates to reflect current conditions.',
    analogy:
      'A mutual fund\'s yield is the average of every bond or stock it holds, weighted by how much of each it owns. ' +
      'Blended APY is your personal "fund yield" across the strategies Genesis holds on your behalf.',
    relatedKeys: ['apy-vs-apr', 'risk-tiers', 'rebalancing'],
  },

  {
    key: 'rebalancing',
    term: 'Rebalancing',
    simple: 'Periodically shifting your allocation across strategies to maintain your target risk profile and capture better yields.',
    detail:
      'Markets change: a strategy that was paying 12% last month may now pay 7%, ' +
      'while a new strategy opens at 14% with comparable risk. Rebalancing means moving capital ' +
      'from lower-performing positions into higher-performing ones — while maintaining the Preserve/Grow/Accelerate ' +
      'ratio that matches your risk tolerance. Genesis monitors for rebalance triggers: ' +
      'APY drops >2% on active positions, better strategies appearing in the same risk tier, ' +
      'or 30-day position staleness. When triggered, a single-tap optimization deploys the rebalance gaslessly.',
    analogy:
      'A gardener prunes overgrown plants and moves seedlings to better soil — ' +
      'not because the plants are failing, but because you\'re always optimizing for the best conditions. ' +
      'Rebalancing is portfolio gardening.',
    relatedKeys: ['blended-apy', 'risk-tiers', 'gas-fees', 'erc-4626'],
  },
]

export function getConceptEntry(key: string): CodexConceptEntry | undefined {
  return CODEX_CONCEPTS.find(c => c.key === key)
}

export function getConceptsByRelatedKey(relatedKey: string): CodexConceptEntry[] {
  return CODEX_CONCEPTS.filter(c => c.relatedKeys?.includes(relatedKey))
}
