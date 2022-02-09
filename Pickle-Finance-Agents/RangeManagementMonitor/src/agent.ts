import { 
  BlockEvent, 
  Finding, 
  HandleBlock, 
  FindingSeverity, 
  FindingType, 
  getEthersProvider
} from 'forta-agent';
import StrategyFetcher, { TickInfo } from "./strategy.fetcher"

const KEEPER_ADDRESS: string = "0xCd2e473DD506DfaDeeA81371053c307a24C05e6D";

const createFinding = (tick: TickInfo, strategy: string): Finding => Finding.fromObject({
  name: "Pickle V3 Strategies tick monitor",
  description: "Tick is out of range",
  alertId: "pickle-rmm",
  severity: FindingSeverity.High,
  type: FindingType.Info,
  metadata: {
    tick_lower: tick.lower.toString(),
    tick_upper: tick.upper.toString(),
    current_tick: tick.current.toString(),
    strategy,
  }
})

export const provideHandleBlock = (fetcher: StrategyFetcher): HandleBlock => 
  async (blockEvent: BlockEvent) => {
    const block: number = blockEvent.blockNumber;
    const findings: Finding[] = [];

    const length: number = await fetcher.getStrategiesLength(block);
    for(let i = 0; i < length; ++i){
      const strategy: string = await fetcher.getStrategy(block, i);
      const tick: TickInfo = await fetcher.getTicks(block, strategy);
      if(tick.lower.gt(tick.current) || tick.upper.lt(tick.current))
        findings.push(createFinding(tick, strategy));
    }
    
    return findings;
  };

export default {
  handleBlock: provideHandleBlock(
    new StrategyFetcher(
      KEEPER_ADDRESS,
      getEthersProvider(),
    )
  ),
};
