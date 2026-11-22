import { createHash } from "node:crypto";
import { createServer } from "node:net";
import ssh2 from "ssh2";

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the PostgreSQL tunnel`);
  return value;
}

function credentials(prefix, username) {
  const expected = requireEnvironment(`${prefix}_FINGERPRINT`);
  return {
    username,
    privateKey: Buffer.from(requireEnvironment(`${prefix}_KEY_BASE64`), "base64"),
    algorithms: { serverHostKey: ["ssh-ed25519"] },
    hostVerifier: key => `SHA256:${createHash("sha256").update(key).digest("base64url")}`
      === expected.replaceAll("+", "-").replaceAll("/", "_"),
    readyTimeout: 9000,
    keepaliveInterval: 30_000,
    keepaliveCountMax: 3,
  };
}

function connect(client, options) {
  return new Promise((resolve, reject) => {
    client.once("ready", resolve);
    client.on("error", reject);
    client.once("close", () => reject(new Error("SSH closed")));
    client.connect(options);
  });
}

export async function startDatabaseBridge() {
  const jumpConfig = {
    ...credentials("SKM_DB_JUMP", "skm-admin-jump"),
    host: requireEnvironment("SKM_DB_JUMP_HOST"),
    port: Number(process.env.SKM_DB_JUMP_PORT ?? "22"),
  };
  const databaseConfig = credentials("SKM_DB_HOME", "skm-site-db");
  let current;

  async function establish() {
    const jump = new ssh2.Client();
    const home = new ssh2.Client();
    let closed = false;
    const reset = () => {
      if (closed) return;
      closed = true;
      current = undefined;
      jump.end();
      home.end();
    };
    try {
      await connect(jump, jumpConfig);
      const stream = await new Promise((resolve, reject) => {
        jump.forwardOut("127.0.0.1", 0, "127.0.0.1", 22220,
          (error, channel) => error ? reject(error) : resolve(channel));
      });
      await connect(home, { ...databaseConfig, sock: stream });
      jump.once("close", reset);
      home.once("close", reset);
      return { home, close: reset };
    } catch {
      jump.end();
      home.end();
      throw new Error("Could not establish the authenticated PostgreSQL tunnel");
    }
  }

  function databaseConnection() {
    current ??= establish().catch(error => {
      current = undefined;
      throw error;
    });
    return current;
  }

  const server = createServer(async socket => {
    socket.on("error", () => socket.destroy());
    try {
      const { home } = await databaseConnection();
      if (socket.destroyed) return;
      home.exec("postgresql", (error, channel) => {
        if (error) {
          socket.destroy();
          return;
        }
        if (socket.destroyed) {
          channel.destroy();
          return;
        }
        channel.on("error", () => socket.destroy());
        channel.once("close", () => socket.destroy());
        socket.once("close", () => channel.destroy());
        channel.stderr.resume();
        socket.pipe(channel);
        channel.pipe(socket);
      });
    } catch {
      socket.destroy();
    }
  });
  server.once("close", () => void current?.then(connection => connection.close()).catch(() => {}));
  try {
    await databaseConnection();
    await new Promise((resolve, reject) => server.once("error", reject).listen(15432, "127.0.0.1", resolve));
  } catch (error) {
    server.close();
    throw error;
  }
  return server;
}
