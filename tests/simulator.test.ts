import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { writeFile } from "node:fs/promises";
import { DEFAULT_CONFIG } from "../extensions/idevflow/config/config.ts";
import { discoverRepository } from "../extensions/idevflow/repository/discovery.ts";
import { discoverSimulatorDevices, selectSimulator } from "../extensions/idevflow/simulator/devices.ts";
import { SimulatorLeaseStore } from "../extensions/idevflow/simulator/leases.ts";
import { captureSimulatorScreenshot } from "../extensions/idevflow/simulator/service.ts";
import type { SimulatorDevice } from "../extensions/idevflow/simulator/types.ts";
import type { CommandProbe } from "../extensions/idevflow/xcode/discovery.ts";
import { createGitFixture } from "./helpers.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

const devices: SimulatorDevice[] = [
  { udid: "new", name: "iPhone 17 Pro", state: "Shutdown", runtimeIdentifier: "iOS-26-1", runtimeVersion: "26.1" },
  { udid: "old", name: "iPhone 16", state: "Booted", runtimeIdentifier: "iOS-25-0", runtimeVersion: "25.0" },
];

describe("simulator leases", () => {
  it("parses and sorts available iPhone devices", async () => {
    const probe: CommandProbe = {
      async run() {
        return { code: 0, stderr: "", stdout: JSON.stringify({ devices: {
          "com.apple.CoreSimulator.SimRuntime.iOS-26-1": [{ udid: "new", name: "iPhone 17 Pro", state: "Shutdown", isAvailable: true, deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro" }],
          "com.apple.CoreSimulator.SimRuntime.tvOS-26-0": [{ udid: "tv", name: "Apple TV", state: "Shutdown", isAvailable: true, deviceTypeIdentifier: "tv" }],
        } }) };
      },
    };
    const result = await discoverSimulatorDevices(".", probe);
    assert.deepEqual(result.map((device) => device.udid), ["new"]);
  });

  it("captures a named screenshot and metadata through the leased device", async () => {
    const fixture = await createGitFixture();
    cleanups.push(fixture.cleanup);
    const repository = await discoverRepository(fixture.root);
    const probe: CommandProbe = {
      async run(_executable, args) {
        if (args[1] === "list") {
          return { code: 0, stderr: "", stdout: JSON.stringify({ devices: {
            "com.apple.CoreSimulator.SimRuntime.iOS-26-1": [{ udid: "new", name: "iPhone 17 Pro", state: "Booted", isAvailable: true, deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro" }],
          } }) };
        }
        if (args[1] === "io") await writeFile(args[4]!, "png");
        return { code: 0, stdout: "", stderr: "" };
      },
    };
    const capture = await captureSimulatorScreenshot(repository, DEFAULT_CONFIG, "session", "compact-light", "source-fingerprint", probe);
    assert.match(capture.path, /compact-light\.png$/);
    assert.match(capture.metadataPath, /compact-light\.metadata\.json$/);
  });

  it("honors preferred device and exclusive lease ownership", async () => {
    assert.equal(selectSimulator(devices, new Set(), "iPhone 16").udid, "old");
    const fixture = await createGitFixture();
    cleanups.push(fixture.cleanup);
    const store = new SimulatorLeaseStore(await discoverRepository(fixture.root));
    const first = await store.acquire(devices, "session-one", 600);
    const second = await store.acquire(devices, "session-two", 600);
    assert.notEqual(first.udid, second.udid);
    assert.equal((await store.release("session-one"))?.sessionId, "session-one");
  });
});
