Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$envFile = Join-Path $repoRoot '.env.local'
if (-not (Test-Path $envFile)) {
    throw '.env.local not found'
}

$envLines = Get-Content $envFile
$apiKeyLine = $envLines | Where-Object { $_ -match '^DEFRAME_API_KEY=' } | Select-Object -First 1
if (-not $apiKeyLine) {
    throw 'DEFRAME_API_KEY not found in .env.local'
}
$apiKey = ($apiKeyLine -replace '^DEFRAME_API_KEY=', '').Trim().Trim('"').Trim("'")

$baseUrlLine = $envLines | Where-Object { $_ -match '^DEFRAME_BASE_URL=' } | Select-Object -First 1
$baseUrl = if ($baseUrlLine) {
    (($baseUrlLine -replace '^DEFRAME_BASE_URL=', '').Trim().Trim('"').Trim("'"))
}
else {
    'https://api.deframe.io'
}

function Infer-Risk([string]$protocol) {
    $p = $protocol.ToLowerInvariant()
    if ($p.Contains('balancer') -or $p.Contains('curve') -or $p.Contains('lp')) { return 'high' }
    if ($p.Contains('morpho') -or $p.Contains('compound')) { return 'medium' }
    return 'low'
}

function Resolve-Risk([string]$baseRisk, [string]$protocol, [string]$liquidityWindow, [string]$riskProfile) {
    if ($riskProfile -eq 'instant_promote') {
        $p = $protocol.ToLowerInvariant()
        if ($liquidityWindow -eq 'instant' -and ($p.Contains('aave') -or $p.Contains('sky') -or $p.Contains('lido'))) {
            if ($baseRisk -eq 'low') { return 'medium' }
        }
    }
    return $baseRisk
}

function Infer-Liquidity([string]$protocol) {
    $p = $protocol.ToLowerInvariant()
    if ($p.Contains('balancer') -or $p.Contains('curve')) { return 'scheduled' }
    if ($p.Contains('morpho')) { return 'same_day' }
    return 'instant'
}

function Map-Chain([int]$networkId, [string]$network) {
    if ($networkId -eq 42161 -or $network -eq 'arbitrum') { return @{ chain = 'arbitrum'; chainId = 42161 } }
    if ($networkId -eq 1 -or $network -eq 'ethereum') { return @{ chain = 'ethereum'; chainId = 1 } }
    return @{ chain = $network; chainId = $networkId }
}

function Parse-Apy([string]$value) {
    $num = 0.0
    [void][double]::TryParse($value, [ref]$num)
    return $num
}

function Norm-Fee([double]$feeBps, [double]$maxFeeBps) {
    if ($maxFeeBps -le 0) { return 0.0 }
    $pct = [Math]::Min([Math]::Max($feeBps / $maxFeeBps, 0), 1)
    return 1 - $pct
}

function Norm-ApyFit([double]$apy, $minApy, $maxApy) {
    if ($null -eq $minApy -and $null -eq $maxApy) { return 1.0 }
    if ($null -ne $minApy -and $apy -lt [double]$minApy) {
        $gap = [Math]::Min((([double]$minApy - $apy) / [Math]::Max([double]$minApy, 1)), 1)
        return 1 - $gap
    }
    if ($null -ne $maxApy -and $apy -gt [double]$maxApy) {
        $gap = [Math]::Min((($apy - [double]$maxApy) / [Math]::Max([double]$maxApy, 1)), 1)
        return 1 - $gap
    }
    return 1.0
}

function Norm-Stability($strategy) {
    $net = Parse-Apy $strategy.netApyPct
    if ($net -le 0) { return 0.0 }

    $avg = $null
    $inc = $null
    if ($strategy.avgApyPct) { $avg = Parse-Apy $strategy.avgApyPct }
    if ($strategy.inceptionApyPct) { $inc = Parse-Apy $strategy.inceptionApyPct }

    if ($null -eq $avg -and $null -eq $inc) { return 0.5 }

    $deltas = @()
    if ($null -ne $avg) { $deltas += [Math]::Abs($avg - $net) / $net }
    if ($null -ne $inc) { $deltas += [Math]::Abs($inc - $net) / $net }

    $meanDelta = ($deltas | Measure-Object -Average).Average
    return [Math]::Max(0, [Math]::Min(1, 1 - ($meanDelta * 2.5)))
}

function Risk-Fit([string]$riskLevel) {
    if ($riskLevel -eq 'high') { return 1.0 }
    if ($riskLevel -eq 'medium') { return 0.82 }
    return 0.6
}

function Liquidity-Fit([string]$liquidityWindow) {
    if ($liquidityWindow -eq 'scheduled') { return 1.0 }
    if ($liquidityWindow -eq 'same_day') { return 0.85 }
    return 0.6
}

function Get-RejectionReason($strategy, $rule, [string]$riskProfile) {
    $apy = Parse-Apy $strategy.netApyPct
    $effectiveRisk = Resolve-Risk -baseRisk $strategy.riskLevel -protocol $strategy.protocol -liquidityWindow $strategy.liquidityWindow -riskProfile $riskProfile

    $riskSpecificMin = $null
    if ($rule.minApyByRisk.ContainsKey($effectiveRisk)) {
        $riskSpecificMin = [double]$rule.minApyByRisk[$effectiveRisk]
    }

    if (-not ($rule.allowedRisks -contains $effectiveRisk)) {
        if ($null -eq $riskSpecificMin) { return 'risk_mismatch' }
        if ($apy -lt $riskSpecificMin) { return 'apy_out_of_band' }
    }

    if (-not ($rule.allowedLiquidity -contains $strategy.liquidityWindow)) { return 'liquidity_mismatch' }
    if ([double]$strategy.feeBps -gt [double]$rule.maxFeeBps) { return 'fee_exceeds' }

    $riskSpecificFloor = 0.0
    if ($null -ne $riskSpecificMin) {
        $riskSpecificFloor = [double]$riskSpecificMin
    }
    $effectiveMin = [Math]::Max([double]$rule.minApyPct, $riskSpecificFloor)
    if ($apy -lt $effectiveMin) { return 'apy_out_of_band' }

    if ($null -ne $rule.maxApyPct -and $apy -gt [double]$rule.maxApyPct) { return 'apy_out_of_band' }

    return $null
}

function Build-Score($strategy, $rule, [string]$riskProfile) {
    $apy = Parse-Apy $strategy.netApyPct
    $apyFit = Norm-ApyFit $apy $rule.minApyPct $rule.maxApyPct
    $netApyScore = [Math]::Min(($apy / 30.0), 1.0)
    $apyComponent = [Math]::Min(1.0, ($apyFit * 0.75) + ($netApyScore * 0.25))

    $effectiveRisk = Resolve-Risk -baseRisk $strategy.riskLevel -protocol $strategy.protocol -liquidityWindow $strategy.liquidityWindow -riskProfile $riskProfile
    $riskComponent = Risk-Fit $effectiveRisk
    $liquidityComponent = Liquidity-Fit $strategy.liquidityWindow
    $feeComponent = Norm-Fee ([double]$strategy.feeBps) ([double]$rule.maxFeeBps)
    $stabilityComponent = Norm-Stability $strategy

    return (0.25 * $riskComponent) + (0.4 * $apyComponent) + (0.1 * $liquidityComponent) + (0.1 * $feeComponent) + (0.15 * $stabilityComponent)
}

$rawStrategies = @()
for ($page = 1; $page -le 5; $page++) {
    $url = "$baseUrl/strategies?page=$page&limit=100"
    $resp = Invoke-RestMethod -Uri $url -Headers @{ 'x-api-key' = $apiKey; 'content-type' = 'application/json' } -Method GET
    $items = @($resp.data)
    if ($items.Count -eq 0) { break }
    $rawStrategies += $items
    if ($items.Count -lt 100) { break }
}

$normalized = foreach ($r in $rawStrategies) {
    $network = ("" + $r.network).ToLowerInvariant()
    $networkId = 0
    if ($null -ne $r.networkId) { $networkId = [int]$r.networkId }
    $chain = Map-Chain -networkId $networkId -network $network

    $actions = @()
    if ($r.availableActions -is [System.Array]) {
        $actions = @($r.availableActions | ForEach-Object { ("" + $_).ToLowerInvariant() })
    }

    $avgApyPct = $null
    $inceptionApyPct = $null
    if ([double]$r.avgApy -gt 0) { $avgApyPct = [Math]::Round(([double]$r.avgApy * 100), 2).ToString('0.00') }
    if ([double]$r.inceptionApy -gt 0) { $inceptionApyPct = [Math]::Round(([double]$r.inceptionApy * 100), 2).ToString('0.00') }

    [pscustomobject]@{
        strategyId       = ("" + $r.id)
        label            = (("" + $r.protocol) + ' ' + (("" + $r.assetName) -replace '^$', 'Asset'))
        protocol         = ("" + $r.protocol)
        chain            = $chain.chain
        chainId          = $chain.chainId
        netApyPct        = [Math]::Round(([double]$r.apy * 100), 2).ToString('0.00')
        avgApyPct        = $avgApyPct
        inceptionApyPct  = $inceptionApyPct
        riskLevel        = Infer-Risk ("" + $r.protocol)
        liquidityWindow  = Infer-Liquidity ("" + $r.protocol)
        feeBps           = [int]([double]$r.fee)
        paused           = [bool]$r.paused
        availableActions = $actions
    }
}

$scoped = @($normalized | Where-Object { @('base', 'polygon', 'gnosis') -contains $_.chain })
$eligible = @(
    $scoped | Where-Object {
        ($_.availableActions -contains 'lend') -and
        (-not $_.paused) -and
        ($_.strategyId.Trim().Length -gt 0) -and
        ($_.protocol.Trim().Length -gt 0) -and
        ($_.label.Trim().Length -gt 0) -and
        ((Parse-Apy $_.netApyPct) -gt 0)
    }
)

$dedupe = @{}
foreach ($s in $eligible) {
    $key = ((@($s.strategyId, $s.protocol, $s.chain, $s.label) -join '::').ToLowerInvariant())
    if (-not $dedupe.ContainsKey($key)) {
        $dedupe[$key] = $s
        continue
    }

    if ((Parse-Apy $s.netApyPct) -gt (Parse-Apy $dedupe[$key].netApyPct)) {
        $dedupe[$key] = $s
    }
}
$deduped = @($dedupe.Values)

$scenarios = @(
    @{ name = 'S1_40_50_noInstant_baseline'; stage1 = 4.0; low = 5.0; stage1Liquidity = @('same_day', 'scheduled'); riskProfile = 'baseline' },
    @{ name = 'S2_40_50_withInstant_baseline'; stage1 = 4.0; low = 5.0; stage1Liquidity = @('instant', 'same_day', 'scheduled'); riskProfile = 'baseline' },
    @{ name = 'S3_45_50_noInstant_baseline'; stage1 = 4.5; low = 5.0; stage1Liquidity = @('same_day', 'scheduled'); riskProfile = 'baseline' },
    @{ name = 'S4_45_50_withInstant_baseline'; stage1 = 4.5; low = 5.0; stage1Liquidity = @('instant', 'same_day', 'scheduled'); riskProfile = 'baseline' },
    @{ name = 'S5_40_50_noInstant_promote'; stage1 = 4.0; low = 5.0; stage1Liquidity = @('same_day', 'scheduled'); riskProfile = 'instant_promote' },
    @{ name = 'S6_40_50_withInstant_promote'; stage1 = 4.0; low = 5.0; stage1Liquidity = @('instant', 'same_day', 'scheduled'); riskProfile = 'instant_promote' },
    @{ name = 'S7_45_50_noInstant_promote'; stage1 = 4.5; low = 5.0; stage1Liquidity = @('same_day', 'scheduled'); riskProfile = 'instant_promote' },
    @{ name = 'S8_45_50_withInstant_promote'; stage1 = 4.5; low = 5.0; stage1Liquidity = @('instant', 'same_day', 'scheduled'); riskProfile = 'instant_promote' }
)

$results = @()
foreach ($scenario in $scenarios) {
    $rule1 = @{
        allowedRisks     = @('medium', 'high')
        minApyByRisk     = @{ low = [double]$scenario.low }
        minApyPct        = [double]$scenario.stage1
        maxApyPct        = 35.0
        allowedLiquidity = $scenario.stage1Liquidity
        maxFeeBps        = 150.0
    }

    $rule2 = @{
        allowedRisks     = @('low', 'medium', 'high')
        minApyByRisk     = @{}
        minApyPct        = 4.0
        maxApyPct        = 50.0
        allowedLiquidity = @('instant', 'same_day', 'scheduled')
        maxFeeBps        = 200.0
    }

    $rules = @($rule1, $rule2)
    $selectedRule = $rule2
    $relaxLevel = 1
    $filtered = @()
    $rejected = @{
        risk_mismatch      = 0
        liquidity_mismatch = 0
        fee_exceeds        = 0
        apy_out_of_band    = 0
    }

    for ($i = 0; $i -lt $rules.Count; $i++) {
        $rule = $rules[$i]
        $passing = @()
        foreach ($s in $deduped) {
            $reason = Get-RejectionReason -strategy $s -rule $rule -riskProfile $scenario.riskProfile
            if ($null -eq $reason) {
                $passing += $s
            }
            else {
                if ($rejected.ContainsKey($reason)) {
                    $rejected[$reason] = [int]$rejected[$reason] + 1
                }
            }
        }

        if ($passing.Count -ge 3 -or $i -eq ($rules.Count - 1)) {
            $selectedRule = $rule
            $relaxLevel = $i
            $filtered = $passing
            break
        }
    }

    $scored = @()
    foreach ($s in $filtered) {
        $scored += [pscustomobject]@{
            strategy = $s
            score    = Build-Score -strategy $s -rule $selectedRule -riskProfile $scenario.riskProfile
            apy      = Parse-Apy $s.netApyPct
        }
    }

    $ordered = @($scored | Sort-Object @{ Expression = 'score'; Descending = $true }, @{ Expression = 'apy'; Descending = $true })

    $selected = @()
    $perProtocol = @{}
    foreach ($entry in $ordered) {
        if ($selected.Count -ge 8) { break }
        $protocol = $entry.strategy.protocol.ToLowerInvariant()
        $count = if ($perProtocol.ContainsKey($protocol)) { [int]$perProtocol[$protocol] } else { 0 }
        if ($count -ge 2) { continue }
        $selected += $entry.strategy
        $perProtocol[$protocol] = $count + 1
    }

    if ($selected.Count -lt 8) {
        $already = @{}
        foreach ($s in $selected) {
            $already[$s.strategyId.ToLowerInvariant()] = $true
        }
        foreach ($entry in $ordered) {
            if ($selected.Count -ge 8) { break }
            $sid = $entry.strategy.strategyId.ToLowerInvariant()
            if ($already.ContainsKey($sid)) { continue }
            $selected += $entry.strategy
            $already[$sid] = $true
        }
    }

    $avgApy = 0.0
    $topApy = 0.0
    if ($selected.Count -gt 0) {
        $selectedApys = @($selected | ForEach-Object { Parse-Apy $_.netApyPct })
        $avgApy = [Math]::Round((($selectedApys | Measure-Object -Average).Average), 2)
        $topApy = [Math]::Round((($selectedApys | Measure-Object -Maximum).Maximum), 2)
    }

    $results += [pscustomobject]@{
        scenario                  = $scenario.name
        stage1MinApy              = [double]$scenario.stage1
        lowRiskMinApy             = [double]$scenario.low
        stage1Liquidity           = ($scenario.stage1Liquidity -join '|')
        riskProfile               = $scenario.riskProfile
        selectedCount             = $selected.Count
        lowSelected               = @($selected | Where-Object { $_.riskLevel -eq 'low' }).Count
        instantSelected           = @($selected | Where-Object { $_.liquidityWindow -eq 'instant' }).Count
        scheduledSelected         = @($selected | Where-Object { $_.liquidityWindow -eq 'scheduled' }).Count
        protocolCount             = @($selected | Select-Object -ExpandProperty protocol -Unique).Count
        avgSelectedApy            = $avgApy
        topSelectedApy            = $topApy
        relaxLevel                = $relaxLevel
        rejectedRiskMismatch      = $rejected.risk_mismatch
        rejectedApyOutOfBand      = $rejected.apy_out_of_band
        rejectedLiquidityMismatch = $rejected.liquidity_mismatch
        recommended               = if ($selected.Count -gt 0) { $selected[0].strategyId } else { '' }
        top3                      = (($selected | Select-Object -First 3 | ForEach-Object { $_.strategyId }) -join ', ')
    }
}

$results | Sort-Object scenario | Format-Table -AutoSize | Out-String | Write-Output
Write-Output '---JSON---'
$results | Sort-Object scenario | ConvertTo-Json -Depth 4 | Write-Output
