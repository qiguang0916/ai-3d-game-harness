import { writeFileSync } from "node:fs";

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  input += chunk;
});
process.stdin.on("end", () => {
  const marker = process.env.REPAIR_MARKER;
  if (!marker) {
    process.stderr.write("REPAIR_MARKER is required\n");
    process.exitCode = 2;
    return;
  }

  const payload = JSON.parse(input) as {
    protocol?: string;
    task?: { id?: string };
  };
  writeFileSync(marker, "repaired\n", "utf8");
  process.stdout.write(
    `repaired ${payload.task?.id ?? "unknown"} using ${payload.protocol ?? "unknown"}\n`,
  );
});
