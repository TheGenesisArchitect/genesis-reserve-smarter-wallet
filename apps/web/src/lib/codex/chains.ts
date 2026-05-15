// ─────────────────────────────────────────────────────────────────────────────
// Codex Academy — Chain Intelligence Entries
//
// Each entry explains WHY a chain produces the yield it does and what
// Genesis specifically unlocks for the user on that chain.
// Tone: plain language, investor-grade insight, no hype.
// ─────────────────────────────────────────────────────────────────────────────

export interface CodexChainEntry {
  key: string
  displayName: string
  /** One-line identity — what makes this chain distinct */
  tagline: string
  /** 2–3 sentences on why yield is compelling here */
  yieldContext: string
  /** What Genesis specifically provides on this chain that retail access cannot */
  genesisNote: string
  /** Relevant risk nuance specific to this chain */
  riskNote: string
}

export const CODEX_CHAINS: Record<string, CodexChainEntry> = {

  ethereum: {
    key: 'ethereum',
    displayName: 'Ethereum',
    tagline: 'The settlement layer — deepest liquidity, highest institutional trust.',
    yieldContext:
      'Ethereum hosts the canonical versions of Aave, Compound, and Morpho — protocols ' +
      'carrying years of battle-testing under billions in real TVL. Yields here reflect ' +
      'genuine borrower demand rather than incentive campaigns, making them the most ' +
      'durable and consistent in DeFi. Institutional capital pools alongside retail, ' +
      'which compresses rates slightly but validates the security of each position.',
    genesisNote:
      'Ethereum gas fees would cost $5–30 per transaction at retail — eliminating the ' +
      'economics of smaller positions. Genesis absorbs every gas cost through account ' +
      'abstraction, making Ethereum-grade security accessible regardless of deposit size.',
    riskNote:
      'Smart contract risk here is the lowest in DeFi — Aave and Compound have operated ' +
      'without a critical exploit for over four years. The primary risk is rate compression ' +
      'during periods of low borrowing demand.',
  },

  arbitrum: {
    key: 'arbitrum',
    displayName: 'Arbitrum',
    tagline: "Ethereum's largest Layer 2 — deep markets, sub-second finality.",
    yieldContext:
      'Arbitrum carries more DeFi TVL than any other Layer 2. Aave, Compound, Morpho, ' +
      'Pendle, and Fluid all operate large USDC lending markets here — often with rates ' +
      'that match or exceed Ethereum mainnet because bridged capital is still scaling ' +
      'relative to demand. Transaction finality is under one second, enabling the kind ' +
      'of rapid rebalancing that extracts meaningful yield over time.',
    genesisNote:
      'Genesis routes preferred allocations through Arbitrum because it combines the ' +
      'protocol depth of Ethereum with the fee efficiency of a Layer 2. Rebalancing ' +
      'your Arbitrum positions costs fractions of a cent — the full yield flows to you.',
    riskNote:
      'Arbitrum inherits Ethereum security for settlement. Bridged assets carry a brief ' +
      'transit risk, but major stablecoins (USDC, USDT) are natively issued or canonically ' +
      'bridged — the counterparty risk is the same as holding on mainnet.',
  },

  base: {
    key: 'base',
    displayName: 'Base',
    tagline: "Coinbase's L2 — fastest-growing yield ecosystem in DeFi.",
    yieldContext:
      'Base launched in 2023 and crossed $10B TVL within its first year — driven by ' +
      'Coinbase distribution and aggressive protocol incentive campaigns. Early-stage ' +
      'protocols bootstrap liquidity by offering elevated APYs that gradually normalize ' +
      'as capital deepens. Being early on Base captures that premium. Aave V3 and Morpho ' +
      'curated vaults on Base currently show rates above their Ethereum mainnet equivalents.',
    genesisNote:
      'Base is one of three blockchains where Circle natively issues USDC — meaning your ' +
      'stablecoin never passes through a bridge contract. This eliminates an entire layer ' +
      'of counterparty risk that bridged-USDC chains carry. Genesis prioritizes native ' +
      'stablecoin chains precisely for this reason.',
    riskNote:
      'Base inherits Ethereum security at the settlement layer. The primary risk is ' +
      'incentive-driven yield compression as TVL scales — rates earned today may normalize ' +
      'to mainnet levels over 12–18 months as the ecosystem matures.',
  },

  polygon: {
    key: 'polygon',
    displayName: 'Polygon',
    tagline: 'High-throughput Ethereum sidechain with mature, battle-tested DeFi markets.',
    yieldContext:
      'Polygon has hosted Aave V3 since its earliest deployment and maintains deep USDC ' +
      'and DAI lending markets with years of continuous operation. Yields are competitive ' +
      'with Ethereum mainnet at a fraction of the transaction cost, making it particularly ' +
      'attractive for strategies that benefit from frequent compounding or rebalancing. ' +
      'Sky (formerly MakerDAO) also operates savings rate infrastructure here.',
    genesisNote:
      'Polygon PoS finalizes transactions in approximately two seconds. Genesis can ' +
      'rebalance Polygon positions on shorter intervals than mainnet strategies, ' +
      'compounding your yield more frequently without the fee overhead that makes ' +
      'frequent rebalancing uneconomical on Ethereum.',
    riskNote:
      'Polygon PoS uses its own validator set rather than Ethereum validators — this is ' +
      'a different security model than true L2s. The network has operated without incident ' +
      'for four years, but the trust assumption is distinct from Arbitrum or Base.',
  },

  optimism: {
    key: 'optimism',
    displayName: 'Optimism',
    tagline: 'OP Stack L2 — the Superchain foundation with active incentive programs.',
    yieldContext:
      'Optimism hosts Aave V3 and several native lending protocols. OP token incentive ' +
      'programs periodically boost yields on specific pools above their organic baseline — ' +
      'creating elevated-yield windows that the Genesis Yield Monitor tracks in real time. ' +
      'As the flagship OP Stack chain, it draws consistent developer and liquidity attention.',
    genesisNote:
      'Optimism and Base share the OP Stack architecture — as the Superchain ecosystem ' +
      'matures, cross-chain liquidity between these networks deepens yield opportunities ' +
      'for both. Genesis monitors incentive campaigns on Optimism specifically because ' +
      'the timing of OP distribution windows creates predictable yield spikes.',
    riskNote:
      'OP Stack chains inherit Ethereum security at the settlement layer with a fraud ' +
      'proof system. Incentive-driven APY on Optimism can compress quickly when ' +
      'distribution windows close — the Yield Monitor flags when organic yield ' +
      'diverges significantly from incentive-boosted rates.',
  },

  gnosis: {
    key: 'gnosis',
    displayName: 'Gnosis',
    tagline: 'DAI-native chain — steady yields from the MakerDAO ecosystem.',
    yieldContext:
      'Gnosis Chain runs on xDAI — a DAI-backed native currency — making it inherently ' +
      'stablecoin-native. Sky Protocol savings rates and bridged USDC lending markets ' +
      'offer consistent, low-volatility yields that rarely see the sharp compression ' +
      'or expansion cycles common on higher-TVL chains. Smaller total TVL means lower ' +
      'competition for yield and sustained organic rates.',
    genesisNote:
      'Gnosis Chain transactions cost fractions of a cent — among the lowest in the ' +
      'EVM ecosystem. Genesis can deploy and rebalance positions here with near-zero ' +
      'friction, maximizing the share of yield that reaches your wallet rather than ' +
      'being consumed by transaction costs.',
    riskNote:
      'Gnosis Chain uses its own Proof of Stake validator set. The chain is backed by ' +
      'the Gnosis DAO and has operated for several years without critical failure. ' +
      'TVL is lower than mainnet chains — this reduces systemic risk but also means ' +
      'fewer protocols to choose from.',
  },

  avalanche: {
    key: 'avalanche',
    displayName: 'Avalanche',
    tagline: 'High-speed L1 with native USDC issuance and sub-second finality.',
    yieldContext:
      'Avalanche C-Chain is one of three blockchains where Circle natively issues USDC, ' +
      'alongside Ethereum and Base. Aave V3 maintains strong USDC lending markets here, ' +
      'and sub-second transaction finality makes it one of the fastest chains for ' +
      'time-sensitive yield strategies. The Avalanche Foundation periodically runs ' +
      'incentive programs that create elevated rate windows.',
    genesisNote:
      'Native USDC on Avalanche eliminates bridge counterparty risk entirely for ' +
      'stablecoin strategies. When Genesis deploys your USDC to an Avalanche strategy, ' +
      'your principal never passes through a bridge contract — the same Circle-issued ' +
      'USDC that left your wallet is the USDC working in the protocol.',
    riskNote:
      'Avalanche C-Chain uses its own Avalanche consensus protocol — not Ethereum ' +
      'validators. It has operated since 2020 with strong uptime. Bridge risk is ' +
      'minimal for USDC due to native issuance, but non-USDC assets bridged to ' +
      'Avalanche carry standard bridge counterparty exposure.',
  },

  bsc: {
    key: 'bsc',
    displayName: 'BSC',
    tagline: 'Binance Smart Chain — high retail volume with elevated incentive yields.',
    yieldContext:
      'BSC handles the highest on-chain transaction volume of any EVM chain, driven by ' +
      'Binance ecosystem activity and a large retail user base. Venus Protocol and ' +
      'PancakeSwap operate deep lending and liquidity markets with yields that frequently ' +
      'exceed other chains due to consistent borrower demand and BNB ecosystem incentives.',
    genesisNote:
      'Genesis applies stricter quality filters on BSC strategies than on Ethereum L2s. ' +
      'Only protocols with established TVL, multi-year operation, and verifiable organic ' +
      'borrower demand qualify. This filters out the higher proportion of incentive-only ' +
      'pools on BSC while preserving access to its genuinely competitive organic rates.',
    riskNote:
      'BSC uses a delegated Proof of Stake model with 21 validators — a smaller, more ' +
      'centralized validator set than Ethereum. The chain has experienced brief outages ' +
      'historically. Genesis treats BSC as an Accelerate-tier risk environment even for ' +
      'stablecoin strategies due to this architecture.',
  },

  scroll: {
    key: 'scroll',
    displayName: 'Scroll',
    tagline: 'zkEVM L2 — Ethereum-equivalent execution with zero-knowledge security.',
    yieldContext:
      'Scroll is a ZK rollup — it uses zero-knowledge proofs to verify every transaction ' +
      'batch on Ethereum, providing stronger security guarantees than optimistic rollups. ' +
      'The ecosystem is earlier-stage than Arbitrum or Base, meaning protocols are still ' +
      'bootstrapping liquidity with elevated incentive yields to attract capital.',
    genesisNote:
      'ZK rollups like Scroll provide near-instant Ethereum finality confirmation rather ' +
      'than the 7-day fraud proof window of optimistic rollups. This means capital deployed ' +
      'on Scroll has shorter exit latency to Ethereum mainnet in worst-case scenarios.',
    riskNote:
      'Scroll is a newer chain — the smart contract surface area for the bridge and ' +
      'rollup infrastructure is less battle-tested than Arbitrum or Optimism. ' +
      'Incentive yields here are more likely to be temporary bootstrapping than organic.',
  },

}

export function getChainEntry(chainRaw: string): CodexChainEntry | undefined {
  const key = chainRaw.toLowerCase().trim()
  if (CODEX_CHAINS[key]) return CODEX_CHAINS[key]
  // Try partial matching for variants like "arbitrum one", "bnb chain", etc.
  return Object.values(CODEX_CHAINS).find(
    (entry) =>
      key.includes(entry.key) ||
      entry.key.includes(key) ||
      key.replace(/[^a-z]/g, '').includes(entry.key.replace(/[^a-z]/g, ''))
  )
}
