export interface ShellPolicyDecision {
  readonly allowed: boolean;
  readonly reason: string;
}

const SIMPLE_READ_COMMANDS = new Set(["pwd", "ls", "rg", "grep", "cat", "head", "tail", "wc", "file", "stat"]);
const READ_GIT_SUBCOMMANDS = new Set(["status", "diff", "log", "show", "rev-parse", "ls-files", "grep"]);
const FORBIDDEN_GIT_ARGUMENTS = ["--output", "--ext-diff", "--textconv", "--open-files-in-pager", "--exec-path"];

function hasForbiddenGitArgument(tokens: readonly string[]): boolean {
  return tokens.some((token) => FORBIDDEN_GIT_ARGUMENTS.some((forbidden) => token === forbidden || token.startsWith(`${forbidden}=`)));
}

function tokenize(command: string): string[] | null {
  const tokens: string[] = [];
  let token = "";
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]!;
    if (quote) {
      if (character === quote) quote = null;
      else if (character === "\\" && quote === '"') token += command[++index] ?? "";
      else token += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (token) tokens.push(token), token = "";
      continue;
    }
    if (";&|><`$(){}\n\r".includes(character)) return null;
    if (character === "\\") token += command[++index] ?? "";
    else token += character;
  }
  if (quote) return null;
  if (token) tokens.push(token);
  return tokens;
}

export function classifyReadOnlyShell(command: string): ShellPolicyDecision {
  const tokens = tokenize(command.trim());
  if (!tokens?.length) return { allowed: false, reason: "empty, compound, expanded, or unparseable shell command" };
  const executable = tokens[0]!.split("/").pop()!;
  if (SIMPLE_READ_COMMANDS.has(executable)) {
    if (executable === "rg" && tokens.some((token) => token === "--pre" || token.startsWith("--pre="))) {
      return { allowed: false, reason: "rg preprocessor execution is forbidden" };
    }
    return { allowed: true, reason: "read-only inspection command" };
  }
  if (executable === "find") {
    const forbidden = tokens.some((token) => ["-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprintf", "-fls"].includes(token));
    return forbidden
      ? { allowed: false, reason: "find mutation or execution action is forbidden" }
      : { allowed: true, reason: "read-only find command" };
  }
  if (executable === "git") {
    const subcommand = tokens.find((token, index) => index > 0 && !token.startsWith("-"));
    if (hasForbiddenGitArgument(tokens)) return { allowed: false, reason: "git output or external-execution argument is forbidden" };
    return subcommand && READ_GIT_SUBCOMMANDS.has(subcommand)
      ? { allowed: true, reason: `read-only git ${subcommand}` }
      : { allowed: false, reason: `git subcommand ${subcommand ?? "unknown"} is not read-only` };
  }
  return { allowed: false, reason: `${executable} is not on the read-only shell allowlist` };
}

function quoteShellWord(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function hardenReadOnlyShell(command: string): string {
  const tokens = tokenize(command.trim());
  if (!tokens?.length || tokens[0]!.split("/").pop() !== "git") return command;
  const args = hardenManagedArgs("git", tokens.slice(1));
  return [tokens[0]!, ...args].map(quoteShellWord).join(" ");
}

export function hardenManagedArgs(executable: string, args: readonly string[]): string[] {
  if (executable !== "git") return [...args];
  const hardened = [...args];
  const subcommandIndex = hardened.findIndex((arg) => !arg.startsWith("-"));
  const subcommand = hardened[subcommandIndex];
  if (subcommand && ["diff", "log", "show"].includes(subcommand)) {
    hardened.splice(subcommandIndex + 1, 0, "--no-ext-diff", "--no-textconv");
  }
  if (!hardened.includes("--no-pager")) hardened.unshift("--no-pager");
  return hardened;
}

export function validateManagedCommand(executable: string, args: readonly string[]): void {
  if (args.some((arg) => arg.includes("\0") || arg.includes("\n"))) throw new Error("Command arguments cannot contain NUL or newlines");
  if (executable === "git") {
    if (hasForbiddenGitArgument(args)) throw new Error("Managed git output or external-execution arguments are forbidden");
    const subcommand = args.find((arg) => !arg.startsWith("-"));
    if (!subcommand || !READ_GIT_SUBCOMMANDS.has(subcommand)) throw new Error(`Managed git subcommand ${subcommand ?? "unknown"} is forbidden`);
    return;
  }
  if (executable === "swift") {
    if (!args.length || !["build", "test"].includes(args[0]!)) throw new Error("Managed swift allows only build or test");
    return;
  }
  if (executable === "xcodebuild") {
    const forbidden = new Set(["archive", "-exportArchive", "-allowProvisioningUpdates", "-allowProvisioningDeviceRegistration"]);
    if (args.some((arg) => forbidden.has(arg))) throw new Error("Archive, export, and provisioning mutations are forbidden in managed verification");
    const actions = args.filter((arg) => ["build", "test", "build-for-testing", "test-without-building", "analyze"].includes(arg));
    if (!actions.length && !args.includes("-version") && !args.includes("-showdestinations") && !args.includes("-list")) {
      throw new Error("Managed xcodebuild requires an allowed build/test action or inspection flag");
    }
    return;
  }
  if (executable === "xcrun") {
    if (args[0] !== "simctl" || !["list", "bootstatus"].includes(args[1] ?? "")) {
      throw new Error("Managed xcrun currently allows only simctl list or bootstatus");
    }
    return;
  }
  throw new Error(`Unsupported managed executable ${executable}`);
}
