import {
  FindingType,
  FindingSeverity,
  Finding,
  HandleTransaction,
  createTransactionEvent,
  HandleBlock,
  BlockEvent
} from "forta-agent";
import agent, { provideHandleBlock } from "./agent";
import { TestBlockEvent, createAddress } from "forta-agent-tools";
import { when } from "jest-when";
import { BigNumber } from "ethers";

type TEST_CASE = [string, string, string, string];

const createFinding = (meta: string[]): Finding => Finding.fromObject({
  name: "Pickle V3 Strategies tick monitor",
  description: "Tick is out of range",
  alertId: "pickle-rmm",
  severity: FindingSeverity.High,
  type: FindingType.Info,
  metadata: {
    strategy: meta[0],
    tick_lower: meta[1],
    current_tick: meta[2],
    tick_upper: meta[3],
  }
})

describe("RMM agent tests suite", () => {
  const mockStrategy = jest.fn();
  const mockLenght = jest.fn();
  const mockTicks = jest.fn();
  const mockFetcher = {
    getStrategiesLength: mockLenght,
    getStrategy: mockStrategy,
    getTicks: mockTicks,
  };
  const handler: HandleBlock = provideHandleBlock(mockFetcher as any);

  const prepareMocks = (block: number, strats: string[]) => {
    when(mockLenght)
      .calledWith(block)
      .mockReturnValueOnce(strats.length);
    for(let i = 0; i < strats.length; ++i){
      when(mockStrategy)
        .calledWith(block, i)
        .mockReturnValueOnce(strats[i]);
    }
  };

  it("should return empty findings if there is no strategies", async () => {
    prepareMocks(10, []);

    const block: BlockEvent = new TestBlockEvent().setNumber(10);
    const findings: Finding[] = await handler(block);
    expect(findings).toStrictEqual([]);
  });

  it("should return empty findings if the current tick is in range", async () => {
    prepareMocks(101, [createAddress("0xdead")]);

    when(mockTicks)
      .calledWith(101, createAddress("0xdead"))
      .mockReturnValueOnce({
        lower: BigNumber.from(1),
        current: BigNumber.from(2),
        upper: BigNumber.from(3),
      })

    const block: BlockEvent = new TestBlockEvent().setNumber(101);
    const findings: Finding[] = await handler(block);
    expect(findings).toStrictEqual([]);
  });

  it("should return multiple findings", async () => {
    const CASES: TEST_CASE[] = [
      [createAddress("0x1"), "1", "20", "3"],
      [createAddress("0x2"), "2", "1", "9"],
      [createAddress("0x3"), "15", "15", "15"],
      [createAddress("0x4"), "100", "99", "100"],
    ];

    prepareMocks(80, CASES.map(([addr,,,]: TEST_CASE) => addr));
    for(let [addr, lower, current, upper] of CASES){
      when(mockTicks)
        .calledWith(80, addr)
        .mockReturnValueOnce({
          lower: BigNumber.from(lower),
          current: BigNumber.from(current),
          upper: BigNumber.from(upper),
        })
    }

    const block: BlockEvent = new TestBlockEvent().setNumber(80);
    const findings: Finding[] = await handler(block);
    expect(findings).toStrictEqual([
      createFinding(CASES[0]),
      createFinding(CASES[1]),
      createFinding(CASES[3]),
    ]);
  });
});
