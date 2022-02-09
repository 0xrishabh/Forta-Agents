import { 
  Finding, 
  getEthersProvider, 
  HandleTransaction, 
  TransactionEvent, 
} from 'forta-agent';
import abi from './abi';
import { MemoryManager } from './memory';
import { 
  LogDescription, 
  TransactionDescription,
} from '@ethersproject/abi';
import DataFetcher from './data.fetcher';
import utils from './utils';
import constants from './constants';
import { Block } from '@ethersproject/abstract-provider';

const AMOUNT_OF_CALLS: number = 5;
const MEMORY: MemoryManager = new MemoryManager(AMOUNT_OF_CALLS);
const FETCHER: DataFetcher = new DataFetcher(
  constants.REGISTRY, 
  getEthersProvider(),
)

const initialize = async () => {
  // fetch lastest block
  const block: number = await FETCHER.provider.getBlockNumber();
  const data: Block = await FETCHER.provider.getBlock(block);

  // Set initial timestamp
  // to avoid fake huge time without call perform alerts
  MEMORY.setTimestamp(data.timestamp);
};

export const provideHandleTransaction = (
  idsList: number[], 
  fetcher: DataFetcher,
  mem: MemoryManager,
  shortPeriod: number,
  mediumPeriod: number,
  hugePeriod: number,
): HandleTransaction => {
  const ids: Set<string> = new Set<string>(
    idsList.map(id => id.toString()),
  );

  const handler: HandleTransaction = async (txEvent: TransactionEvent): Promise<Finding[]> => {
    const findings: Finding[] = [];
    const block: number = txEvent.blockNumber;
    const timestamp: number = txEvent.timestamp;

    // check huge periods without performing a strategy
    const upkeeps: string[] = await Promise.all(
      idsList.map(id => fetcher.getUpkeep(block, id))
    );
    const strategies: string[][] = await Promise.all(
      upkeeps.map(upkeep => fetcher.getStrategies(block, upkeep))
    );
    for(let i = 0; i < ids.size; ++i) {
      for(let strat of strategies[i]) {
        const last: number = mem.getLast(upkeeps[i], strat);
        if((last === -1) || (timestamp - last >= hugePeriod)) {
          findings.push(utils.notCalledFinding(
            idsList[i],
            upkeeps[i],
            strat,
            timestamp - Math.max(last, 0),
            hugePeriod,
          ));
        }
      }
    }

    // Analize addition/removals in the keepers
    upkeeps.forEach((keeper: string) => {
      txEvent
        .filterFunction(abi.STRATEGIES_MANAGMENT, keeper)
        .forEach((desc: TransactionDescription) =>
          // @ts-ignore
          mem[desc.name](
            keeper, 
            desc.args[0].toLowerCase(), 
            timestamp)
          )
    });  

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

  const lastAlert: Record<string, number> = {};

  const floodModeratorHandler: HandleTransaction = async (txEvent: TransactionEvent): Promise<Finding[]> => {
    const findings: Finding[] = await handler(txEvent);
    const timestamp: number = txEvent.timestamp;

    const validFindings: Finding[] = [];
    for(let finding of findings){
      const keeper: string = finding.metadata.keeperAddress;
      const strat: string = finding.metadata.strategyAddress;
      const frame: string = finding.metadata.timeFrame;
      const key: string = `${keeper}-${strat}-${frame}`;
      let valid: boolean = false;
      
      if(!lastAlert[key])
        valid = true;
      else {
        const last: number = lastAlert[key];

        const frameNumber: number = Number(frame);
        switch(frameNumber){
          case shortPeriod:
          case mediumPeriod:
            valid = (timestamp - last > shortPeriod);
            break;
          default:
            valid = (timestamp - last > mediumPeriod);
        }
      }

      if(valid){
        validFindings.push(finding);
        lastAlert[key] = timestamp;
      }
    }

    return validFindings;
  };

  return floodModeratorHandler;
}

export default {
  initialize,
  handleTransaction: provideHandleTransaction(
    constants.IDS,
    FETCHER,
    MEMORY,
    constants.ONE_DAY,
    constants.ONE_WEEK,
    constants.ONE_MONTH,
  ),
};
