const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const MAX_LOG_ENTRIES = 200;

class SyncManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.states = new Map();
    this.stateFile = path.join(ctx.dataDir, "sync-states.json");
  }

  loadStates(vaults) {
    try {
      const saved = JSON.parse(fs.readFileSync(this.stateFile, "utf-8"));

      for (const entry of saved) {
        const vaultPath = vaults[entry.vaultId];

        if (!vaultPath) {
          this.ctx.log(`Skipping state for missing vault: ${entry.vaultId}`);
          continue;
        }

        this.states.set(entry.vaultId, {
          vaultId: entry.vaultId,
          vaultPath,
          remoteVault: entry.remoteVault,
          status: "stopped",
          pid: null,
          lastActivity: new Date().toISOString(),
          error: null,
          config: entry.config || {
            mode: "bidirectional",
            deviceName: "ignis-headless",
          },
          autoStart: entry.autoStart || false,
          logs: [],
          _process: null,
        });
      }

      this.ctx.log(`Loaded ${saved.length} sync configurations`);
    } catch {
      this.ctx.log("No previous sync states found");
    }
  }

  saveStates() {
    const data = [];

    for (const [vaultId, state] of this.states) {
      data.push({
        vaultId: state.vaultId,
        vaultPath: state.vaultPath,
        remoteVault: state.remoteVault,
        config: state.config,
        autoStart: state.autoStart,
      });
    }

    fs.writeFileSync(this.stateFile, JSON.stringify(data, null, 2), "utf-8");
  }

  async setupSync(vaultId, vaultPath, remoteVault, options = {}) {
    const obCli = require("./ob-cli");

    const args = ["sync-setup", "--vault", remoteVault, "--path", "."];

    if (options.vaultPassword) {
      args.push("--password", options.vaultPassword);
    }

    if (options.deviceName) {
      args.push("--device-name", options.deviceName);
    }

    await obCli.runCommand(args, { cwd: vaultPath });

    const state = {
      vaultId,
      vaultPath,
      remoteVault,
      status: "stopped",
      pid: null,
      lastActivity: new Date().toISOString(),
      error: null,
      config: {
        mode: options.mode || "bidirectional",
        deviceName: options.deviceName || "ignis-headless",
      },
      autoStart: false,
      logs: [],
      _process: null,
    };

    this.states.set(vaultId, state);
    this.saveStates();
    this.ctx.log(`Sync setup complete for ${vaultId} -> ${remoteVault}`);

    return this.getState(vaultId);
  }

  startSync(vaultId) {
    const state = this.states.get(vaultId);

    if (!state) {
      throw new Error(`No sync configuration for vault: ${vaultId}`);
    }

    if (state.status === "running") {
      this.ctx.log(`Sync already running for ${vaultId}`);
      return this.getState(vaultId);
    }

    const args = ["sync", "--continuous"];

    if (state.config.mode === "pull-only") {
      args.push("--pull-only");
    } else if (state.config.mode === "mirror-remote") {
      args.push("--mirror-remote");
    }

    const proc = spawn("ob", args, {
      cwd: state.vaultPath,
      env: { ...process.env, HOME: os.homedir() },
    });

    state.status = "running";
    state.pid = proc.pid;
    state.error = null;
    state.autoStart = true;
    state._process = proc;

    this.addLog(state, `Sync started (pid: ${proc.pid})`);

    proc.stdout.on("data", (data) => {
      const lines = data.toString().split("\n");

      for (const line of lines) {
        if (line.trim()) {
          this.addLog(state, line.trim());
          state.lastActivity = new Date().toISOString();
        }
      }
    });

    proc.stderr.on("data", (data) => {
      const lines = data.toString().split("\n");

      for (const line of lines) {
        if (line.trim()) {
          this.addLog(state, `[stderr] ${line.trim()}`);
        }
      }
    });

    proc.on("close", (code) => {
      state.status = code === 0 ? "stopped" : "error";
      state.pid = null;
      state._process = null;

      if (code !== 0) {
        state.error = `Process exited with code ${code}`;
        this.addLog(state, `Sync exited with code ${code}`);
      } else {
        this.addLog(state, "Sync stopped");
      }

      this.ctx.log(`Sync stopped for ${vaultId} (code: ${code})`);
      this.broadcastStatus(vaultId);
      this.saveStates();
    });

    proc.on("error", (err) => {
      state.status = "error";
      state.error = err.message;
      state.pid = null;
      state._process = null;

      this.addLog(state, `Error: ${err.message}`);
      this.ctx.log(`Sync error for ${vaultId}: ${err.message}`);
      this.broadcastStatus(vaultId);
      this.saveStates();
    });

    this.broadcastStatus(vaultId);
    this.ctx.log(`Started sync for ${vaultId} (pid: ${proc.pid})`);
    this.saveStates();

    return this.getState(vaultId);
  }

  stopSync(vaultId) {
    const state = this.states.get(vaultId);

    if (!state || !state._process) {
      throw new Error(`No active sync for vault: ${vaultId}`);
    }

    state._process.kill("SIGTERM");
    state.status = "stopped";
    state.pid = null;
    state.autoStart = false;
    state._process = null;

    this.addLog(state, "Sync stopped by user");
    this.ctx.log(`Stopped sync for ${vaultId}`);
    this.broadcastStatus(vaultId);
    this.saveStates();

    return this.getState(vaultId);
  }

  getState(vaultId) {
    const state = this.states.get(vaultId);

    if (!state) {
      return null;
    }

    return {
      vaultId: state.vaultId,
      remoteVault: state.remoteVault,
      status: state.status,
      pid: state.pid,
      lastActivity: state.lastActivity,
      error: state.error,
      config: state.config,
      autoStart: state.autoStart,
    };
  }

  getAllStates() {
    const result = [];

    for (const [vaultId] of this.states) {
      result.push(this.getState(vaultId));
    }

    return result;
  }

  getLogs(vaultId, limit = 100) {
    const state = this.states.get(vaultId);

    if (!state) {
      return [];
    }

    return state.logs.slice(-limit);
  }

  addLog(state, line) {
    state.logs.push({
      timestamp: new Date().toISOString(),
      line,
    });

    if (state.logs.length > MAX_LOG_ENTRIES) {
      state.logs = state.logs.slice(-MAX_LOG_ENTRIES);
    }
  }

  broadcastStatus(vaultId) {
    const state = this.getState(vaultId);

    if (!state) {
      return;
    }

    const message = JSON.stringify({
      channel: "plugin:headless-sync",
      type: "sync-status",
      payload: state,
    });

    if (this.ctx.wss && this.ctx.wss.clients) {
      for (const client of this.ctx.wss.clients) {
        if (client.readyState === 1) {
          client.send(message);
        }
      }
    }
  }

  autoStartAll() {
    let started = 0;

    for (const [vaultId, state] of this.states) {
      if (state.autoStart && state.status === "stopped") {
        try {
          this.startSync(vaultId);
          started++;
        } catch (e) {
          this.ctx.log(`Auto-start failed for ${vaultId}: ${e.message}`);
        }
      }
    }

    if (started > 0) {
      this.ctx.log(`Auto-started sync for ${started} vault(s)`);
    }
  }

  async shutdown() {
    this.ctx.log("Shutting down sync manager...");

    for (const [vaultId, state] of this.states) {
      if (state._process) {
        this.ctx.log(`Stopping sync for ${vaultId}...`);

        try {
          state._process.kill("SIGTERM");
        } catch (e) {
          this.ctx.log(`Error stopping sync for ${vaultId}: ${e.message}`);
        }
      }
    }
  }
}

module.exports = { SyncManager };
