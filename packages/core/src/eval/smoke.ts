import {
  formatInventionBenchmarkReport,
  runCrmInventionBenchmark,
} from "./invention-harness";

const result = runCrmInventionBenchmark();
console.log(formatInventionBenchmarkReport(result));
if (!result.passesExitCheck) {
  process.exitCode = 1;
}
