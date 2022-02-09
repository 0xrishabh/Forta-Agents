import { Finding, TransactionEvent } from "forta-agent";
import abi from "./abi";
import DataFetcher from "./data.fetcher";
import { MemoryManager } from "./memory";
import utils from './utils';
import { 
  LogDescription, 
  TransactionDescription,
} from '@ethersproject/abi';

const getMainHandler = (
  idsList: number[], 
  fetcher: DataFetcher,
  mem: MemoryManager,
  shortPeriod: number,
  mediumPeriod: number,
  hugePeriod: number,
) => {
  const ids: Set<string> = new Set<string>(
    idsList.map(id => id.toString()),
  );

  return async (txEvent: TransactionEvent): Promise<Finding[]> => {
    const findings: Finding[] = [];
    const block: number = txEvent.blockNumber;
    const timestamp: number = txEvent.timestamp;

    for(let id of idsList) {
      const upkeep: string = await fetcher.getUpkeep(block, id);

      // check huge periods without performing a strategy
      const length: number = await fetcher.getStrategiesLength(block, upkeep);
      for(let i = 0; i < length; ++i) {
        const strategy: string = await fetcher.getStrategy(block, upkeep, i);
        const last: number = mem.getLast(upkeep, strategy);
        if((last === -1) || (timestamp - last >= hugePeriod)) {
          findings.push(utils.notCalledFinding(
            id,
            upkeep,
            strategy,
            timestamp - Math.max(last, 0),
            hugePeriod,
          ));
        }
      }

      // Analize addition/removals in the keepers
      txEvent
        .filterFunction(abi.STRATEGIES_MANAGMENT, upkeep)
        .forEach((desc: TransactionDescription) =>
          // @ts-ignore
          mem[desc.name](
            upkeep, 
            desc.args[0].toLowerCase(), 
            timestamp)
          );
    }

    // Detect performUpkeep calls
    const logs: LogDescription[] = txEvent.filterLog(abi.REGISTRY, fetcher.registry);
    for(let log of logs) {
      if(ids.has(log.args.id.toString())){
        const keeper: string = await fetcher.getUpkeep(block, log.args.id);
        const strat: string = utils.decodePerformData(log.args.performData);
        const diff: number = mem.update(keeper, strat, timestamp);

        if(diff <= shortPeriod)
          findings.push(utils.highCallsFinding(
            log.args.id,
            keeper,
            strat,
            0,
            mem.getCount(keeper, strat),
            shortPeriod,
          ))
        if(diff <= mediumPeriod)
          findings.push(utils.mediumCallsFinding(
            log.args.id,
            keeper,
            strat,
            0,
            mem.getCount(keeper, strat),
            mediumPeriod,
          ))
      }
    }

    return findings;
  };
};

export default getMainHandler;