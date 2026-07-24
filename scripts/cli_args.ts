import { parseArgs, type ParseArgsConfig } from "node:util";

export interface CommandSpec {
  command: string;
  usage: string;
  options?: ParseArgsConfig["options"];
  minPositionals: number;
  maxPositionals: number;
}

export type CommandParseResult =
  | { kind: "help" }
  | {
      kind: "ok";
      values: Record<string, string | boolean | undefined>;
      positionals: string[];
    }
  | { kind: "error"; message: string; usage: string };

function positionalMessage(spec: CommandSpec, actual: number): string {
  if (spec.minPositionals === spec.maxPositionals) {
    return `${spec.command}: expected exactly ${spec.minPositionals} positional argument(s), got ${actual}`;
  }
  return `${spec.command}: expected ${spec.minPositionals}-${spec.maxPositionals} positional arguments, got ${actual}`;
}

export function parseCommand(spec: CommandSpec, argv: string[]): CommandParseResult {
  const terminator = argv.indexOf("--");
  const optionArgs = terminator === -1 ? argv : argv.slice(0, terminator);
  if (optionArgs.includes("--help") || optionArgs.includes("-h")) return { kind: "help" };

  try {
    const parsed = parseArgs({
      args: argv,
      options: spec.options ?? {},
      strict: true,
      allowPositionals: true,
      tokens: true,
    });
    if (
      parsed.positionals.length < spec.minPositionals
      || parsed.positionals.length > spec.maxPositionals
    ) {
      return {
        kind: "error",
        message: positionalMessage(spec, parsed.positionals.length),
        usage: spec.usage,
      };
    }
    return {
      kind: "ok",
      values: { ...parsed.values } as Record<string, string | boolean | undefined>,
      positionals: parsed.positionals,
    };
  } catch (error: unknown) {
    return {
      kind: "error",
      message: (error as Error).message,
      usage: spec.usage,
    };
  }
}
