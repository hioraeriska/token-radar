# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/hioraeriska/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/hioraeriska/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token launch radar: pre-token protocols ranked by fitted implied value, with costed farm plans.

## What it does

`main.ts` reads the sealed DefiLlama snapshot (`/input/snapshot.json`), fits a
value model on the snapshot's own live-token comparables, and writes a ranked
board to `/output/board.json` plus a static, no-network dashboard.

The model (`radar-2`, in `lib/model.ts`) is fitted at run time, never
hardcoded to a protocol name:

- **Size curve**: `ln(mcap) = a + b * ln(tvl)`, OLS on the 128 live-token
  protocols that record a market cap. The curve is sublinear (b ~ 0.49),
  so a protocol ten times bigger is worth only about three times more per
  dollar of TVL.
- **Category factor**: median of market cap over the size curve per
  category, shrunk toward 1. Bridges and basis trading sit near 3x,
  liquid staking near 0.5x.
- **Growth**: a small momentum weight on clamped 7-day TVL change. The
  cross-sectional fit finds growth mean-reverting, so the model does not
  chase it.
- **Maturity**: older protocols are discounted slightly; one that has run
  for years without a token is less likely to issue one.
- **Token probability**: the share of the protocol's own category that
  already has a token, blended toward one half.

The board covers all 40 watchlist protocols plus 160 early pre-token
protocols below the $50M floor. Every row carries a verdict (Farm it /
Worth a position / Watch it / Low priority) and a seven-step farm plan with
costs and times, derived from the protocol's category, chains, TVL and age.
Live-token protocols are set aside with their market caps shown, and they
are the comparables the model is fitted on.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

## Entered on [make.fun](https://make.fun/?ref=q6vfjq4s&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
