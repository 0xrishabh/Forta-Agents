import { BigNumberish, Contract, providers, utils } from "ethers";
import LRU from "lru-cache";  
import abi from "./abi";

type ResultType = Promise<string | number>;

export default class DataFetcher {
  readonly registry: string;
  private rContract: Contract;
  readonly provider: providers.Provider;
  private cache: LRU<string, ResultType>;

  constructor(registry: string, provider: providers.Provider) {
    this.registry = registry;
    this.provider = provider;
    this.rContract = new Contract(registry, abi.REGISTRY, provider);
    this.cache = new LRU<string, ResultType>({max: 10000});
  }

  public async getUpkeep(block: number, id: BigNumberish): Promise<string> {
    const key: string = `upkeep-${block}-${id.toString()}`;
    if(this.cache.has(key))
      return this.cache.get(key) as Promise<string>;

    const address: Promise<string> = this.rContract
      .getUpkeep(id, { blockTag: block })
      .then((result: any) => result.target.toLowerCase());
    this.cache.set(key, address);
    return address;
  }

  public async getStrategiesLength(block: number, keeper: string): Promise<number> {
    const key: string = `lenght-${block}-${keeper}`;
    if(this.cache.has(key))
      return this.cache.get(key) as Promise<number>;

    const length: Promise<number> = await this.provider
      .getStorageAt(keeper, 0, block)
      .then((encodedLength: string) => utils.defaultAbiCoder
        .decode(['uint256'], encodedLength)[0]
      );

    this.cache.set(key, length);
    return length;
  }

  public async getStrategy(block: number, keeper: string, idx: number): Promise<string> {
    const key: string = `strat-${block}-${keeper}-${idx}`;
    if(this.cache.has(key))
      return this.cache.get(key) as Promise<string>;

    const kContract: Contract = new Contract(keeper, abi.KEEPER, this.provider);

    const strategy: Promise<string> = kContract
      .strategyArray(idx, { blockTag: block })
      .then((strat: string) => strat.toLowerCase());
    
    this.cache.set(key, strategy);
    return strategy;
  }

  // for testing purposes
  public async getStrategies(block: number, keeper: string): Promise<string[]> {
    const length: number = await this.getStrategiesLength(block, keeper);

    const strategies: Promise<string>[] = [];
    for(let i = 0; i < length; ++i)
      strategies.push(this.getStrategy(block, keeper, i));
    
    return Promise.all(strategies);
  }
};
