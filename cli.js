#!/usr/bin/env node
const { spawn } = require("child_process");
const path = require("path");
const commander = require("commander");

const program = new commander.Command();

program
  .command("start")
  .description("Start the image converter site")
  .action(() => {
    console.log("Starting server...");
    const serverPath = path.resolve(__dirname, "server.js");

    // 子プロセスを起動
    const serverProcess = spawn("node", [serverPath], {
      stdio: "inherit", // 標準出力・エラーを親プロセスに引き継ぐ
    });

    // 親プロセスで SIGINT をキャッチし、子プロセスに転送
    process.on("SIGINT", () => {
      console.log("Forwarding SIGINT to server process...");
      serverProcess.kill("SIGINT");
    });

    // 子プロセス終了時に親プロセスも終了
    serverProcess.on("close", (code) => {
      console.log(`Server process exited with code ${code}`);
      process.exit(code);
    });
  });

program
  .command("restart")
  .description("Restart the server")
  .action(() => {
    console.log("Restarting server...");
    exec(`pm2 restart server.js`, (err) => {
      if (err) console.error(err);
    });
  });

program.parse(process.argv);
