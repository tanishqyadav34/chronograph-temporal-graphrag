/**
 * Tests for lib/neo4j.ts — driver memoization and runQuery mapping, with a
 * fully mocked neo4j-driver (no live database).
 */
jest.mock("neo4j-driver", () => {
  const driver = jest.fn();
  const auth = { basic: jest.fn() };
  return { __esModule: true, default: { driver, auth }, auth, driver };
});

import neo4j from "neo4j-driver";
import { getDriver, runQuery } from "@/lib/neo4j";

const driverMock = (neo4j as unknown as { driver: jest.Mock }).driver;
const authBasicMock = (neo4j as unknown as { auth: { basic: jest.Mock } }).auth.basic;

function makeFakeSession() {
  return {
    run: jest.fn(async () => ({
      records: [
        { toObject: () => ({ name: "Alice", count: 3 }) },
        { toObject: () => ({ name: "Bob", count: 1 }) },
      ],
    })),
    close: jest.fn(async () => {}),
  };
}

describe("lib/neo4j", () => {
  const session = makeFakeSession();
  const fakeDriver = { session: jest.fn(() => session) };

  beforeAll(() => {
    authBasicMock.mockReturnValue({ scheme: "basic", principal: "neo4j", credentials: "x" });
    driverMock.mockReturnValue(fakeDriver);
  });

  beforeEach(() => {
    process.env.NEO4J_URI = "bolt://localhost:7687";
    process.env.NEO4J_USER = "neo4j";
    process.env.NEO4J_PASSWORD = "secret";
    driverMock.mockClear();
    authBasicMock.mockClear();
    fakeDriver.session.mockClear();
    session.run.mockClear();
    (session.close as jest.Mock).mockClear();
  });

  it("builds exactly one driver from env config and memoizes it", async () => {
    const first = getDriver();
    const second = getDriver();

    expect(driverMock).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(driverMock).toHaveBeenCalledWith("bolt://localhost:7687", expect.anything());
    expect(authBasicMock).toHaveBeenCalledWith("neo4j", "secret");

    // Multiple queries must reuse the memoized driver (one session each).
    await runQuery("MATCH (n) RETURN n.name AS name", { x: 1 });
    await runQuery("MATCH (m) RETURN m.name AS name");
    expect(driverMock).toHaveBeenCalledTimes(1);
    expect(fakeDriver.session).toHaveBeenCalledTimes(2);
  });

  it("maps result records to plain objects and closes the session", async () => {
    const rows = await runQuery("MATCH (n) RETURN n.name AS name", { x: 1 });

    expect(session.run).toHaveBeenCalledWith("MATCH (n) RETURN n.name AS name", { x: 1 });
    expect(rows).toEqual([
      { name: "Alice", count: 3 },
      { name: "Bob", count: 1 },
    ]);
    expect(session.close).toHaveBeenCalledTimes(1);
  });

  it("closes the session even when the query fails", async () => {
    session.run.mockRejectedValueOnce(new Error("boom"));

    await expect(runQuery("BAD CYPHER")).rejects.toThrow("boom");
    expect(session.close).toHaveBeenCalledTimes(1);
  });
});
