export type TierKey = 'flexible' | 'income' | 'growth'
export type Horizon = 30 | 60 | 90 | 365
export type Corridor = 'US-PH' | 'US-MX' | 'US-IN'

export const PERFORMANCE_WINDOWS: Horizon[] = [30, 60, 90, 365]

export interface GrowthPoint {
    month: number
    conservative: number
    base: number
    optimistic: number
}

export const TIER_APY: Record<TierKey, number> = {
    flexible: 0.048,
    income: 0.062,
    growth: 0.112,
}

export const CORRIDOR_RATES: Record<Corridor, { rate: number; currency: string }> = {
    'US-PH': { rate: 55.26, currency: 'PHP' },
    'US-MX': { rate: 17.12, currency: 'MXN' },
    'US-IN': { rate: 83.15, currency: 'INR' },
}

export const COST_CONFIG = {
    platformFee: 0.0042,
    spread: 0.0025,
    genesisFee: 0.015,
    partnerShare: 0.01,
}

export interface ForecastInputs {
    principal: number
    tier: TierKey
    horizon: Horizon
    users: number
}

export interface ForecastOutputs {
    apy: number
    totalYield: number
    genesisFee: number
    partnerRevenue: number
    netToUsers: number
    perUserDaily: number
}

export function calculateForecast(inputs: ForecastInputs): ForecastOutputs {
    const apy = TIER_APY[inputs.tier]
    const totalYield = inputs.principal * apy * (inputs.horizon / 365)
    const genesisFee = totalYield * COST_CONFIG.genesisFee
    const partnerRevenue = totalYield * COST_CONFIG.partnerShare
    const netToUsers = totalYield - genesisFee - partnerRevenue
    const perUserDaily = inputs.users > 0 ? netToUsers / inputs.users / inputs.horizon : 0

    return { apy, totalYield, genesisFee, partnerRevenue, netToUsers, perUserDaily }
}

export function buildGrowthCurve(startAum: number, monthlyInflow: number, months: number): GrowthPoint[] {
    let conservative = startAum
    let base = startAum
    let optimistic = startAum
    const points: GrowthPoint[] = []

    for (let month = 1; month <= months; month += 1) {
        conservative = (conservative + monthlyInflow) * (1 + TIER_APY.flexible / 12)
        base = (base + monthlyInflow) * (1 + TIER_APY.income / 12)
        optimistic = (optimistic + monthlyInflow) * (1 + TIER_APY.growth / 12)
        points.push({ month, conservative, base, optimistic })
    }

    return points
}

export interface CorridorCostInputs {
    monthlySendVolume: number
    avgTxSize: number
}

export interface CorridorCostOutputs {
    txCount: number
    platformCost: number
    spreadCost: number
    totalCost: number
    costPer1k: number
}

export function calculateCorridorCosts(inputs: CorridorCostInputs): CorridorCostOutputs {
    const txCount = inputs.avgTxSize > 0 ? inputs.monthlySendVolume / inputs.avgTxSize : 0
    const platformCost = inputs.monthlySendVolume * COST_CONFIG.platformFee
    const spreadCost = inputs.monthlySendVolume * COST_CONFIG.spread
    const totalCost = platformCost + spreadCost
    const costPer1k = inputs.monthlySendVolume > 0 ? (totalCost / inputs.monthlySendVolume) * 1000 : 0

    return { txCount, platformCost, spreadCost, totalCost, costPer1k }
}

export interface PerformanceComparisonRow {
    horizon: Horizon
    withGenesisNetYield: number
    withoutGenesisYield: number
    incrementalYield: number
    perUserDailyLift: number
}

export interface PerformanceComparisonInputs {
    principal: number
    tier: TierKey
    users: number
    withoutGenesisApy: number
}

export function buildPerformanceComparison(inputs: PerformanceComparisonInputs): PerformanceComparisonRow[] {
    return PERFORMANCE_WINDOWS.map((horizon) => {
        const withGenesisGross = inputs.principal * TIER_APY[inputs.tier] * (horizon / 365)
        const withGenesisNetYield = withGenesisGross * (1 - COST_CONFIG.genesisFee - COST_CONFIG.partnerShare)
        const withoutGenesisYield = inputs.principal * inputs.withoutGenesisApy * (horizon / 365)
        const incrementalYield = withGenesisNetYield - withoutGenesisYield
        const perUserDailyLift = inputs.users > 0 ? incrementalYield / inputs.users / horizon : 0

        return {
            horizon,
            withGenesisNetYield,
            withoutGenesisYield,
            incrementalYield,
            perUserDailyLift,
        }
    })
}

export interface OnboardingImpactInputs {
    prospects: number
    avgWalletBalance: number
    kycPassRateWithGenesis: number
    kycPassRateWithoutGenesis: number
    daysToFirstValueWithGenesis: number
    daysToFirstValueWithoutGenesis: number
}

export interface OnboardingImpactOutputs {
    activatedWithGenesis: number
    activatedWithoutGenesis: number
    activationLiftUsers: number
    activationLiftPct: number
    principalWithGenesis: number
    principalWithoutGenesis: number
    speedAdvantageDays: number
}

export function calculateOnboardingImpact(inputs: OnboardingImpactInputs): OnboardingImpactOutputs {
    const activatedWithGenesis = Math.round(inputs.prospects * inputs.kycPassRateWithGenesis)
    const activatedWithoutGenesis = Math.round(inputs.prospects * inputs.kycPassRateWithoutGenesis)
    const activationLiftUsers = activatedWithGenesis - activatedWithoutGenesis
    const activationLiftPct = activatedWithoutGenesis > 0
        ? (activationLiftUsers / activatedWithoutGenesis)
        : 0

    return {
        activatedWithGenesis,
        activatedWithoutGenesis,
        activationLiftUsers,
        activationLiftPct,
        principalWithGenesis: activatedWithGenesis * inputs.avgWalletBalance,
        principalWithoutGenesis: activatedWithoutGenesis * inputs.avgWalletBalance,
        speedAdvantageDays: Math.max(0, inputs.daysToFirstValueWithoutGenesis - inputs.daysToFirstValueWithGenesis),
    }
}

export interface UserBalanceProjectionPoint {
    month: number
    usersWithGenesis: number
    usersWithoutGenesis: number
    avgBalanceWithGenesis: number
    avgBalanceWithoutGenesis: number
    aumWithGenesis: number
    aumWithoutGenesis: number
}

export interface UserBalanceProjectionInputs {
    startingUsers: number
    monthlyNewUsers: number
    monthlyChurnWithGenesis: number
    monthlyChurnWithoutGenesis: number
    avgBalanceStart: number
    monthlyBalanceGrowthWithGenesis: number
    monthlyBalanceGrowthWithoutGenesis: number
    months: number
}

export function buildUserBalanceProjection(inputs: UserBalanceProjectionInputs): UserBalanceProjectionPoint[] {
    let usersWithGenesis = inputs.startingUsers
    let usersWithoutGenesis = inputs.startingUsers
    let avgBalanceWithGenesis = inputs.avgBalanceStart
    let avgBalanceWithoutGenesis = inputs.avgBalanceStart
    const points: UserBalanceProjectionPoint[] = []

    for (let month = 1; month <= inputs.months; month += 1) {
        usersWithGenesis = Math.max(0, (usersWithGenesis * (1 - inputs.monthlyChurnWithGenesis)) + inputs.monthlyNewUsers)
        usersWithoutGenesis = Math.max(0, (usersWithoutGenesis * (1 - inputs.monthlyChurnWithoutGenesis)) + inputs.monthlyNewUsers)

        avgBalanceWithGenesis = avgBalanceWithGenesis * (1 + inputs.monthlyBalanceGrowthWithGenesis)
        avgBalanceWithoutGenesis = avgBalanceWithoutGenesis * (1 + inputs.monthlyBalanceGrowthWithoutGenesis)

        points.push({
            month,
            usersWithGenesis,
            usersWithoutGenesis,
            avgBalanceWithGenesis,
            avgBalanceWithoutGenesis,
            aumWithGenesis: usersWithGenesis * avgBalanceWithGenesis,
            aumWithoutGenesis: usersWithoutGenesis * avgBalanceWithoutGenesis,
        })
    }

    return points
}

export interface BreakEvenInputs {
    integrationCost: number
    monthlyPartnerRevenue: number
}

export interface BreakEvenOutputs {
    monthsToBreakEven: number | null
    annualPartnerRevenue: number
    roiYearOne: number
}

export function calculateBreakEven(inputs: BreakEvenInputs): BreakEvenOutputs {
    const annualPartnerRevenue = inputs.monthlyPartnerRevenue * 12
    const monthsToBreakEven = inputs.monthlyPartnerRevenue > 0
        ? inputs.integrationCost / inputs.monthlyPartnerRevenue
        : null
    const roiYearOne = inputs.integrationCost > 0
        ? ((annualPartnerRevenue - inputs.integrationCost) / inputs.integrationCost)
        : 0

    return {
        monthsToBreakEven,
        annualPartnerRevenue,
        roiYearOne,
    }
}
