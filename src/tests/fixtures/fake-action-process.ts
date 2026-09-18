let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  input += chunk;
});
process.stdin.on("end", () => {
  const request = JSON.parse(input) as {
    protocol?: string;
    action?: string;
    input?: Record<string, unknown>;
    projectRoot?: string;
  };

  process.stdout.write("fake action diagnostic\n");
  process.stdout.write(
    `${JSON.stringify({
      outcome: request.input?.shouldFail === true ? "fail" : "pass",
      summary: `handled ${request.action ?? "unknown"}`,
      metadata: {
        protocol: request.protocol,
        projectRoot: request.projectRoot,
      },
    })}\n`,
  );
});
